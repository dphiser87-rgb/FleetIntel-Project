import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:uuid/uuid.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/check_item_tile.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/section_header.dart';

/// Checklist item types and defect-capture rules mirror the backend contract (InspectionAnswer /
/// InspectionIn in server.py) and the proven Expo prototype's InspectionScreen.js: a "fail" answer
/// is not submittable without a defect_type, a photo, and a note -- ported here as-is rather than
/// redesigned, since it already matches what the backend/web app expect.
///
/// Visual layout ported from the Primio-designed reference app's inspection_screen.dart
/// (CheckItemTile chip row, InspectionSectionHeader, progress bar, submitted success screen) --
/// this is a merge, not a straight port: Primio's version has no photo/signature/GPS/offline-outbox
/// support, so every one of those real behaviors is preserved as-is under the new visual shell.
const kDefectTypes = ['tyres', 'engine', 'brakes', 'electrical', 'bodywork', 'general'];

class _Answer {
  String? value;
  String note = '';
  String? photoDataUrl;
  String? defectType;
  final noteController = TextEditingController();
  final key = GlobalKey();
}

class InspectionScreen extends ConsumerStatefulWidget {
  const InspectionScreen({super.key, required this.template, required this.vehicle});

  final Map<String, dynamic> template;
  final Map<String, dynamic> vehicle;

  @override
  ConsumerState<InspectionScreen> createState() => _InspectionScreenState();
}

class _InspectionScreenState extends ConsumerState<InspectionScreen> {
  final _clientSubmissionId = const Uuid().v4();
  final _startedAt = DateTime.now().toUtc().toIso8601String();
  final _answers = <String, _Answer>{};
  final _notesController = TextEditingController();
  final _odometerController = TextEditingController();
  final _signatureController = SignatureController(penColor: Colors.white, penStrokeWidth: 3);
  final _speech = SpeechToText();
  String? _signatureDataUrl;
  bool _submitting = false;
  bool _speechAvailable = false;
  final _picker = ImagePicker();

  // Set once the submit call (or offline-queue fallback) succeeds; switches build() to the
  // success screen. Not reset -- this screen is popped after, never reused for another inspection.
  bool? _submittedOffline;

  List<Map<String, dynamic>> get _sections =>
      (widget.template['sections'] as List? ?? []).map((s) => Map<String, dynamic>.from(s)).toList();

  @override
  void initState() {
    super.initState();
    _speech.initialize().then((ok) => setState(() => _speechAvailable = ok));
  }

  @override
  void dispose() {
    _notesController.dispose();
    _odometerController.dispose();
    _signatureController.dispose();
    for (final a in _answers.values) {
      a.noteController.dispose();
    }
    _speech.stop();
    super.dispose();
  }

  _Answer _answerFor(String itemId) => _answers.putIfAbsent(itemId, () => _Answer());

  Future<void> _capturePhoto(String itemId) async {
    final photo = await _picker.pickImage(source: ImageSource.camera, imageQuality: 60);
    if (photo == null) return;
    final bytes = await photo.readAsBytes();
    setState(() => _answerFor(itemId).photoDataUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}');
  }

  List<String> _missingForFail(Map<String, dynamic> item) {
    final a = _answerFor(item['id'] as String);
    final missing = <String>[];
    if (a.defectType == null) missing.add('defect type');
    if (a.photoDataUrl == null) missing.add('photo');
    if (a.note.trim().isEmpty) missing.add('note');
    return missing;
  }

  bool _itemComplete(Map<String, dynamic> item) {
    final a = _answerFor(item['id'] as String);
    if ((a.value ?? '').isEmpty) return false;
    if ((a.value ?? '').toLowerCase() == 'fail') return _missingForFail(item).isEmpty;
    return true;
  }

  int get _totalItems => _sections.fold(0, (sum, s) => sum + (s['items'] as List? ?? []).length);

  int get _completedItems => _sections.fold(
        0,
        (sum, s) => sum +
            (s['items'] as List? ?? [])
                .map((e) => Map<String, dynamic>.from(e))
                .where(_itemComplete)
                .length,
      );

  bool get _hasUnresolvedFails {
    for (final section in _sections) {
      for (final item in (section['items'] as List? ?? [])) {
        final map = Map<String, dynamic>.from(item);
        final a = _answerFor(map['id'] as String);
        if ((a.value ?? '').toLowerCase() == 'fail' && _missingForFail(map).isNotEmpty) return true;
      }
    }
    return false;
  }

  bool get _odometerMissing {
    final v = double.tryParse(_odometerController.text);
    return v == null || v <= 0;
  }

  // Deliberately not gated on _completedItems == _totalItems: unlike Primio's mocked flow, our
  // real backend only ever required odometer + signature + resolved fails (see InspectionIn in
  // server.py) -- items left blank are legitimately optional/not-applicable, so the progress
  // count here is informational only, matching the original screen's real submit behavior.
  bool get _canSubmit => !_odometerMissing && _signatureDataUrl != null && !_hasUnresolvedFails;

  Future<void> _openSignaturePad() async {
    _signatureController.clear();
    final result = await showModalBottomSheet<Uint8List?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      builder: (context) => _SignaturePad(controller: _signatureController),
    );
    if (result != null) {
      setState(() => _signatureDataUrl = 'data:image/png;base64,${base64Encode(result)}');
    }
  }

  Future<({double? lat, double? lng, String status, String? address})> _captureLocation() async {
    try {
      final permission = await Geolocator.checkPermission();
      var granted = permission;
      if (granted == LocationPermission.denied) {
        granted = await Geolocator.requestPermission();
      }
      if (granted == LocationPermission.denied || granted == LocationPermission.deniedForever) {
        return (lat: null, lng: null, status: 'denied', address: null);
      }
      if (!await Geolocator.isLocationServiceEnabled()) {
        return (lat: null, lng: null, status: 'unavailable', address: null);
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium),
      ).timeout(const Duration(seconds: 8));

      String? address;
      try {
        final placemarks = await Geocoding()
            .placemarkFromCoordinates(pos.latitude, pos.longitude)
            .timeout(const Duration(seconds: 6));
        if (placemarks.isNotEmpty) {
          final p = placemarks.first;
          address = [p.street, p.locality, p.administrativeArea, p.country]
              .where((s) => s != null && s.isNotEmpty)
              .join(', ');
        }
      } catch (_) {
        // Reverse geocoding is best-effort -- the coordinates alone are still useful without it.
      }

      return (lat: pos.latitude, lng: pos.longitude, status: 'captured', address: address);
    } catch (_) {
      return (lat: null, lng: null, status: 'unavailable', address: null);
    }
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);

    final location = await _captureLocation();
    final payload = {
      'template_id': widget.template['id'],
      'vehicle_id': widget.vehicle['id'],
      'odometer': double.tryParse(_odometerController.text),
      'notes': _notesController.text,
      'answers': _answers.entries
          .map((e) => {
                'item_id': e.key,
                'value': e.value.value ?? '',
                'note': e.value.note,
                'photo': e.value.photoDataUrl,
                'defect_type': e.value.defectType,
              })
          .toList(),
      'completed_at': DateTime.now().toUtc().toIso8601String(),
      'started_at': _startedAt,
      'latitude': location.lat,
      'longitude': location.lng,
      'address': location.address,
      'location_status': location.status,
      'signature': _signatureDataUrl,
      'client_submission_id': _clientSubmissionId,
    };

    final dio = ref.read(apiClientProvider).dio;
    try {
      await dio.post('/inspections', data: payload);
      if (mounted) setState(() => _submittedOffline = false);
    } on DioException catch (e) {
      // No response reaching back means a dropped connection, not a rejection -- queue for later,
      // matching the Expo prototype's offlineQueue.js semantics.
      if (e.response == null) {
        await ref.read(outboxRepositoryProvider).enqueue(
              id: _clientSubmissionId,
              kind: 'inspection',
              method: 'POST',
              endpoint: '/inspections',
              payload: payload,
            );
        if (mounted) setState(() => _submittedOffline = true);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to submit. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  int get _failCount => _answers.values.where((a) => (a.value ?? '').toLowerCase() == 'fail').length;

  @override
  Widget build(BuildContext context) {
    if (_submittedOffline != null) {
      return _SubmittedView(offline: _submittedOffline!, failCount: _failCount);
    }

    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final total = _totalItems;
    final completed = _completedItems;
    final progress = total == 0 ? 0.0 : completed / total;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.template['name'] as String? ?? 'Inspection'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: AppMetrics.screenPadding),
            child: Center(
              child: Text('$completed/$total', style: text.labelMedium?.copyWith(color: colors.primary)),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          LinearProgressIndicator(
            value: progress,
            backgroundColor: AppColors.border,
            color: _failCount > 0 ? AppColors.danger : colors.primary,
            minHeight: 3,
          ),
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                Padding(
                  padding: const EdgeInsets.all(AppMetrics.spacingMd),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        '${widget.vehicle['make'] ?? ''} ${widget.vehicle['model'] ?? ''}'.trim(),
                        style: text.titleMedium,
                      ),
                      const SizedBox(height: AppMetrics.spacingSm + 4),
                      TextField(
                        controller: _odometerController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Odometer (km) *'),
                      ),
                    ],
                  ),
                ),
                for (int i = 0; i < _sections.length; i++)
                  _SectionBlock(
                    section: _sections[i],
                    sectionIndex: i,
                    answerFor: _answerFor,
                    missingForFail: _missingForFail,
                    itemComplete: _itemComplete,
                    onCapturePhoto: _capturePhoto,
                    onChanged: () => setState(() {}),
                    speech: _speech,
                    speechAvailable: _speechAvailable,
                  ),
                Padding(
                  padding: const EdgeInsets.all(AppMetrics.spacingMd),
                  child: TextField(
                    controller: _notesController,
                    maxLines: 3,
                    decoration: InputDecoration(
                      labelText: 'General notes',
                      suffixIcon:
                          _speechAvailable ? _VoiceMicButton(speech: _speech, controller: _notesController) : null,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('Signature *', style: text.labelMedium),
                      const SizedBox(height: AppMetrics.spacingSm),
                      if (_signatureDataUrl != null)
                        Container(
                          height: 120,
                          decoration: BoxDecoration(border: Border.all(color: AppColors.border)),
                          child: Image.memory(
                            base64Decode(_signatureDataUrl!.split(',').last),
                            fit: BoxFit.contain,
                          ),
                        ),
                      const SizedBox(height: AppMetrics.spacingSm),
                      FleetButton(
                        label: _signatureDataUrl != null ? 'Re-sign' : 'Sign',
                        isOutlined: true,
                        onPressed: _openSignaturePad,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppMetrics.spacingLg),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(
              AppMetrics.screenPadding,
              AppMetrics.spacingSm + 4,
              AppMetrics.screenPadding,
              AppMetrics.spacingMd,
            ),
            decoration: BoxDecoration(
              color: AppColors.surface,
              border: Border(top: BorderSide(color: AppColors.border)),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_failCount > 0)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppMetrics.spacingSm),
                      child: Row(
                        children: [
                          Icon(Icons.warning_amber_rounded, color: AppColors.danger, size: AppMetrics.iconSm),
                          const SizedBox(width: AppMetrics.spacingSm),
                          Text(
                            '$_failCount defect${_failCount > 1 ? 's' : ''} flagged',
                            style: text.bodySmall?.copyWith(color: AppColors.danger),
                          ),
                        ],
                      ),
                    ),
                  if (!_canSubmit)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppMetrics.spacingSm),
                      child: Text(
                        'Before you can submit: ${[
                          if (_odometerMissing) 'odometer reading',
                          if (_signatureDataUrl == null) 'signature',
                          if (_hasUnresolvedFails) 'defect type/photo/note on every failed item',
                        ].join(', ')}.',
                        style: text.bodySmall?.copyWith(color: AppColors.danger),
                      ),
                    ),
                  FleetButton(
                    label: 'Submit inspection',
                    isLoading: _submitting,
                    onPressed: (_canSubmit && !_submitting) ? _submit : null,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Toggles on-device speech recognition and appends whatever it hears to [controller]'s text --
/// shared by every note/description field in this screen so a driver never has to type with
/// gloves on. Best-effort: if speech isn't available on the device this just doesn't render
/// (see _speechAvailable), it's never a blocker.
class _VoiceMicButton extends StatefulWidget {
  const _VoiceMicButton({required this.speech, required this.controller});

  final SpeechToText speech;
  final TextEditingController controller;

  @override
  State<_VoiceMicButton> createState() => _VoiceMicButtonState();
}

class _VoiceMicButtonState extends State<_VoiceMicButton> {
  bool _listening = false;
  String _baseText = '';

  Future<void> _toggle() async {
    if (_listening) {
      await widget.speech.stop();
      setState(() => _listening = false);
      return;
    }
    _baseText = widget.controller.text;
    setState(() => _listening = true);
    await widget.speech.listen(
      onResult: (result) {
        final heard = result.recognizedWords;
        final merged = _baseText.isEmpty ? heard : '$_baseText $heard';
        widget.controller.text = merged;
        widget.controller.selection = TextSelection.collapsed(offset: merged.length);
      },
      listenFor: const Duration(seconds: 30),
      pauseFor: const Duration(seconds: 4),
    );
    if (mounted) setState(() => _listening = false);
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(_listening ? Icons.mic : Icons.mic_none, color: _listening ? AppColors.primary : AppColors.muted),
      onPressed: _toggle,
      tooltip: 'Dictate',
    );
  }
}

class _SectionBlock extends StatelessWidget {
  const _SectionBlock({
    required this.section,
    required this.sectionIndex,
    required this.answerFor,
    required this.missingForFail,
    required this.itemComplete,
    required this.onCapturePhoto,
    required this.onChanged,
    required this.speech,
    required this.speechAvailable,
  });

  final Map<String, dynamic> section;
  final int sectionIndex;
  final _Answer Function(String) answerFor;
  final List<String> Function(Map<String, dynamic>) missingForFail;
  final bool Function(Map<String, dynamic>) itemComplete;
  final Future<void> Function(String) onCapturePhoto;
  final VoidCallback onChanged;
  final SpeechToText speech;
  final bool speechAvailable;

  @override
  Widget build(BuildContext context) {
    final items = (section['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
    final completed = items.where(itemComplete).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InspectionSectionHeader(
          name: section['title'] as String? ?? '',
          sectionIndex: sectionIndex,
          completed: completed,
          total: items.length,
        ),
        for (final item in items)
          _ItemRow(
            item: item,
            answer: answerFor(item['id'] as String),
            missingForFail: missingForFail,
            onCapturePhoto: onCapturePhoto,
            onChanged: onChanged,
            speech: speech,
            speechAvailable: speechAvailable,
          ),
      ],
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({
    required this.item,
    required this.answer,
    required this.missingForFail,
    required this.onCapturePhoto,
    required this.onChanged,
    required this.speech,
    required this.speechAvailable,
  });

  final Map<String, dynamic> item;
  final _Answer answer;
  final List<String> Function(Map<String, dynamic>) missingForFail;
  final Future<void> Function(String) onCapturePhoto;
  final VoidCallback onChanged;
  final SpeechToText speech;
  final bool speechAvailable;

  @override
  Widget build(BuildContext context) {
    final type = item['type'] as String? ?? 'boolean';
    final label = item['label'] as String? ?? '';
    final required = item['required'] == true;
    final isFail = (answer.value ?? '').toLowerCase() == 'fail';
    final text = Theme.of(context).textTheme;
    answer.noteController.text = answer.note;

    if (type == 'boolean') {
      return Container(
        key: answer.key,
        color: AppColors.surface,
        child: Column(
          children: [
            CheckItemTile(
              label: '$label${required ? ' *' : ''}',
              selectedValue: switch (answer.value?.toLowerCase()) {
                'pass' => 'pass',
                'fail' => 'fail',
                'na' => 'na',
                _ => null,
              },
              onResultChanged: (result) {
                answer.value = result;
                onChanged();
              },
            ),
            if (isFail)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(
                  AppMetrics.spacingMd,
                  0,
                  AppMetrics.spacingMd,
                  AppMetrics.spacingMd,
                ),
                decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
                child: _FailDetails(
                  item: item,
                  answer: answer,
                  onCapturePhoto: onCapturePhoto,
                  onChanged: onChanged,
                  speech: speech,
                  speechAvailable: speechAvailable,
                ),
              ),
          ],
        ),
      );
    }

    return Container(
      key: answer.key,
      margin: const EdgeInsets.only(top: 1),
      padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: AppMetrics.spacingSm + 4),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label${required ? ' *' : ''}', style: text.bodyMedium),
          const SizedBox(height: AppMetrics.spacingSm + 2),
          if (type == 'rating')
            Wrap(
              spacing: AppMetrics.spacingSm,
              children: List.generate(5, (i) {
                final n = (i + 1).toString();
                return ChoiceChip(
                  label: Text(n),
                  selected: answer.value == n,
                  onSelected: (_) {
                    answer.value = n;
                    onChanged();
                  },
                );
              }),
            ),
          if (type == 'text' || type == 'number')
            TextField(
              keyboardType: type == 'number' ? TextInputType.number : TextInputType.text,
              onChanged: (v) => answer.value = v,
              decoration: const InputDecoration(isDense: true),
            ),
          Padding(
            padding: const EdgeInsets.only(top: AppMetrics.spacingSm),
            child: TextField(
              controller: answer.noteController,
              onChanged: (v) => answer.note = v,
              decoration: InputDecoration(
                isDense: true,
                hintText: 'Note…',
                suffixIcon: speechAvailable ? _VoiceMicButton(speech: speech, controller: answer.noteController) : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FailDetails extends StatelessWidget {
  const _FailDetails({
    required this.item,
    required this.answer,
    required this.onCapturePhoto,
    required this.onChanged,
    required this.speech,
    required this.speechAvailable,
  });

  final Map<String, dynamic> item;
  final _Answer answer;
  final Future<void> Function(String) onCapturePhoto;
  final VoidCallback onChanged;
  final SpeechToText speech;
  final bool speechAvailable;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppMetrics.spacingSm - 2,
          children: kDefectTypes
              .map((dt) => ChoiceChip(
                    label: Text(dt),
                    selected: answer.defectType == dt,
                    onSelected: (_) {
                      answer.defectType = dt;
                      onChanged();
                    },
                  ))
              .toList(),
        ),
        const SizedBox(height: AppMetrics.spacingSm),
        TextField(
          controller: answer.noteController,
          onChanged: (v) {
            answer.note = v;
            onChanged();
          },
          decoration: InputDecoration(
            isDense: true,
            hintText: 'Describe the defect… *',
            suffixIcon: speechAvailable ? _VoiceMicButton(speech: speech, controller: answer.noteController) : null,
          ),
        ),
        const SizedBox(height: AppMetrics.spacingSm),
        FleetButton(
          label: answer.photoDataUrl != null ? 'Photo captured' : '+ Photo (required)',
          isOutlined: true,
          icon: Icons.camera_alt_outlined,
          onPressed: () async {
            await onCapturePhoto(item['id'] as String);
            onChanged();
          },
        ),
        if (answer.photoDataUrl != null)
          Padding(
            padding: const EdgeInsets.only(top: AppMetrics.spacingSm),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
              child: Image.memory(
                base64Decode(answer.photoDataUrl!.split(',').last),
                width: 64,
                height: 64,
                fit: BoxFit.cover,
              ),
            ),
          ),
      ],
    );
  }
}

class _SignaturePad extends StatelessWidget {
  const _SignaturePad({required this.controller});

  final SignatureController controller;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppMetrics.spacingMd),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Sign below'),
            const SizedBox(height: AppMetrics.spacingSm + 4),
            Container(
              height: 240,
              decoration: BoxDecoration(border: Border.all(color: AppColors.border)),
              child: Signature(controller: controller, backgroundColor: AppColors.surface),
            ),
            const SizedBox(height: AppMetrics.spacingSm + 4),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: AppMetrics.spacingSm),
                Expanded(
                  child: OutlinedButton(
                    onPressed: controller.clear,
                    child: const Text('Clear'),
                  ),
                ),
                const SizedBox(width: AppMetrics.spacingSm),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () async {
                      if (controller.isEmpty) return;
                      final bytes = await controller.toPngBytes();
                      if (context.mounted) Navigator.of(context).pop(bytes);
                    },
                    child: const Text('Confirm'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Success screen shown after a real submit succeeds (online or queued offline) -- ported from
/// Primio's _SubmittedView, extended with the offline case our real submit flow can hit.
class _SubmittedView extends StatelessWidget {
  const _SubmittedView({required this.offline, required this.failCount});

  final bool offline;
  final int failCount;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    final String message;
    if (offline) {
      message = "This inspection will sync automatically once you're back online.";
    } else if (failCount > 0) {
      message = '$failCount defect${failCount > 1 ? 's' : ''} recorded. Your fleet manager has been notified.';
    } else {
      message = "All checks passed. You're clear to depart.";
    }

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.screenPadding),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                ),
                child: Icon(
                  offline ? Icons.cloud_off_outlined : Icons.check_circle_outline,
                  color: colors.primary,
                  size: AppMetrics.iconLg + 8,
                ),
              ),
              const SizedBox(height: AppMetrics.spacingLg),
              Text(offline ? 'Saved offline' : 'Inspection submitted', style: text.headlineMedium),
              const SizedBox(height: AppMetrics.spacingSm),
              Text(message, style: text.bodyMedium?.copyWith(color: AppColors.muted), textAlign: TextAlign.center),
              const Spacer(),
              FleetButton(
                label: 'Done',
                onPressed: () {
                  Navigator.of(context).pop(); // close inspection screen (pushed outside go_router)
                  context.go('/welcome');
                },
              ),
              const SizedBox(height: AppMetrics.spacingLg),
            ],
          ),
        ),
      ),
    );
  }
}
