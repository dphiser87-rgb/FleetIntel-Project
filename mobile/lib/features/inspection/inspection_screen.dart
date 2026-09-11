import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:uuid/uuid.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/defect_fields.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/review_sheet.dart';
import '../../core/widgets/section_header.dart';
import '../../core/widgets/signature_pad.dart';
import 'inspection_complete_screen.dart';

/// Checklist item types and defect-capture rules mirror the backend contract (InspectionAnswer /
/// InspectionIn in server.py): a "fail" answer is not submittable without a defect_type, a photo,
/// and a note.
///
/// Visual layout ported from the Fleet Hub reference app's inspection/flat.tsx: segmented Pass/Fail
/// buttons (no N/A for the flat type, matching the reference), inline defect fields under a failing
/// item, an inline (non-modal) signature pad, and a "Review & submit" step via a bottom sheet before
/// the real submit fires -- every real behavior (GPS capture, offline outbox, idempotency, photo
/// capture) is preserved as-is under the new shell.
class _Answer {
  String? value;
  String note = '';
  String? photoDataUrl;
  String? defectType;
  final noteController = TextEditingController();
}

class InspectionScreen extends ConsumerStatefulWidget {
  const InspectionScreen({super.key, required this.template, required this.vehicle, required this.odometer});

  final Map<String, dynamic> template;
  final Map<String, dynamic> vehicle;
  final double odometer;

  @override
  ConsumerState<InspectionScreen> createState() => _InspectionScreenState();
}

class _InspectionScreenState extends ConsumerState<InspectionScreen> {
  final _clientSubmissionId = const Uuid().v4();
  final _startedAt = DateTime.now().toUtc().toIso8601String();
  final _answers = <String, _Answer>{};
  final _signatureController = SignatureController(penColor: Colors.white, penStrokeWidth: 3);
  final _speech = SpeechToText();
  bool _speechAvailable = false;
  String? _validation;
  final _picker = ImagePicker();

  List<Map<String, dynamic>> get _sections =>
      (widget.template['sections'] as List? ?? []).map((s) => Map<String, dynamic>.from(s)).toList();

  List<Map<String, dynamic>> get _allItems =>
      _sections.expand((s) => (s['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e))).toList();

  @override
  void initState() {
    super.initState();
    _speech.initialize().then((ok) => setState(() => _speechAvailable = ok));
  }

  @override
  void dispose() {
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

  int get _answeredCount => _allItems.where((i) => (_answerFor(i['id'] as String).value ?? '').isNotEmpty).length;

  int get _failCount => _answers.values.where((a) => (a.value ?? '').toLowerCase() == 'fail').length;

  void _setStatus(String itemId, String status) {
    setState(() {
      _answerFor(itemId).value = status;
      _validation = null;
    });
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

  void _onReview() {
    if (_answeredCount < _allItems.length) {
      setState(() => _validation = 'Answer every item before submitting.');
      return;
    }
    for (final item in _allItems) {
      final a = _answerFor(item['id'] as String);
      if ((a.value ?? '').toLowerCase() == 'fail' && (a.defectType == null || a.note.trim().isEmpty)) {
        setState(() => _validation = 'Every failed item needs a category and note.');
        return;
      }
    }
    if (_signatureController.isEmpty) {
      setState(() => _validation = 'Please sign to confirm your inspection.');
      return;
    }
    setState(() => _validation = null);

    final flagged = _allItems
        .where((i) => (_answerFor(i['id'] as String).value ?? '').toLowerCase() == 'fail')
        .map((i) {
      final a = _answerFor(i['id'] as String);
      return FlaggedReviewItem(
        label: i['label'] as String? ?? '',
        status: 'fail',
        category: a.defectType ?? '',
        note: a.note,
        hasPhoto: a.photoDataUrl != null,
      );
    }).toList();

    showReviewSheet(context, flagged: flagged, totalCount: _allItems.length, onConfirm: _submit);
  }

  Future<void> _submit() async {
    final signatureBytes = await _signatureController.toPngBytes();
    final signatureDataUrl =
        signatureBytes != null ? 'data:image/png;base64,${base64Encode(signatureBytes)}' : null;
    final location = await _captureLocation();
    final payload = {
      'template_id': widget.template['id'],
      'vehicle_id': widget.vehicle['id'],
      'odometer': widget.odometer,
      'notes': '',
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
      'signature': signatureDataUrl,
      'client_submission_id': _clientSubmissionId,
    };

    final dio = ref.read(apiClientProvider).dio;
    var queued = false;
    try {
      await dio.post('/inspections', data: payload);
    } on DioException catch (e) {
      // No response reaching back means a dropped connection, not a rejection -- queue for later.
      if (e.response == null) {
        await ref.read(outboxRepositoryProvider).enqueue(
              id: _clientSubmissionId,
              kind: 'inspection',
              method: 'POST',
              endpoint: '/inspections',
              payload: payload,
            );
        queued = true;
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to submit. Please try again.')),
          );
        }
        return;
      }
    }

    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => InspectionCompleteScreen(
          overallStatus: _failCount > 0 ? 'critical' : 'pass',
          defectCount: _failCount,
          queued: queued,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final total = _allItems.length;
    final answered = _answeredCount;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.template['name'] as String? ?? 'Inspection'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: LinearProgressIndicator(
            value: total == 0 ? 0.0 : answered / total,
            backgroundColor: AppColors.border,
            color: _failCount > 0 ? AppColors.danger : colors.primary,
            minHeight: 3,
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: AppMetrics.screenPadding),
            child: Center(
              child: Text('$answered/$total', style: text.labelMedium?.copyWith(color: colors.primary)),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppMetrics.spacingLg),
              children: [
                for (int i = 0; i < _sections.length; i++) ...[
                  InspectionSectionHeader(
                    name: _sections[i]['title'] as String? ?? '',
                    sectionIndex: i,
                    completed: (_sections[i]['items'] as List? ?? [])
                        .map((e) => Map<String, dynamic>.from(e))
                        .where((it) => (_answerFor(it['id'] as String).value ?? '').isNotEmpty)
                        .length,
                    total: (_sections[i]['items'] as List? ?? []).length,
                  ),
                  const SizedBox(height: AppMetrics.spacingMd),
                  for (final item in (_sections[i]['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)))
                    _ItemCard(
                      item: item,
                      answer: _answerFor(item['id'] as String),
                      onSetStatus: (status) => _setStatus(item['id'] as String, status),
                      onCapturePhoto: () async {
                        await _capturePhoto(item['id'] as String);
                        setState(() {});
                      },
                      onDefectTypeChanged: (dt) => setState(() => _answerFor(item['id'] as String).defectType = dt),
                      onNoteChanged: (v) => _answerFor(item['id'] as String).note = v,
                      speech: _speech,
                      speechAvailable: _speechAvailable,
                    ),
                  const SizedBox(height: AppMetrics.spacingLg),
                ],
                Text('DRIVER SIGNATURE', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
                const SizedBox(height: AppMetrics.spacingSm),
                SignaturePad(controller: _signatureController),
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
            decoration: const BoxDecoration(
              color: AppColors.surface,
              border: Border(top: BorderSide(color: AppColors.border)),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_validation != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppMetrics.spacingSm),
                      child: Row(
                        children: [
                          const Icon(Icons.warning_amber_rounded, color: AppColors.warning, size: AppMetrics.iconSm),
                          const SizedBox(width: AppMetrics.spacingSm),
                          Expanded(child: Text(_validation!, style: text.bodySmall?.copyWith(color: AppColors.warning))),
                        ],
                      ),
                    ),
                  FleetButton(label: 'Review & submit', onPressed: _onReview),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({
    required this.item,
    required this.answer,
    required this.onSetStatus,
    required this.onCapturePhoto,
    required this.onDefectTypeChanged,
    required this.onNoteChanged,
    required this.speech,
    required this.speechAvailable,
  });

  final Map<String, dynamic> item;
  final _Answer answer;
  final ValueChanged<String> onSetStatus;
  final VoidCallback onCapturePhoto;
  final ValueChanged<String> onDefectTypeChanged;
  final ValueChanged<String> onNoteChanged;
  final SpeechToText speech;
  final bool speechAvailable;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final isFail = (answer.value ?? '').toLowerCase() == 'fail';
    answer.noteController.text = answer.note;

    return Container(
      margin: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
      padding: const EdgeInsets.all(AppMetrics.spacingMd),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item['label'] as String? ?? '', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: AppMetrics.spacingMd),
          Row(
            children: [
              Expanded(
                child: _SegButton(
                  label: 'Pass',
                  icon: Icons.check,
                  active: answer.value?.toLowerCase() == 'pass',
                  activeColor: AppColors.primary,
                  activeInk: AppColors.primaryInk,
                  onTap: () => onSetStatus('pass'),
                ),
              ),
              const SizedBox(width: AppMetrics.spacingSm),
              Expanded(
                child: _SegButton(
                  label: 'Fail',
                  icon: Icons.close,
                  active: isFail,
                  activeColor: AppColors.danger,
                  activeInk: Colors.white,
                  onTap: () => onSetStatus('fail'),
                ),
              ),
            ],
          ),
          if (isFail) ...[
            const SizedBox(height: AppMetrics.spacingMd),
            DefectFields(
              defectType: answer.defectType,
              noteController: answer.noteController,
              photoDataUrl: answer.photoDataUrl,
              onDefectTypeChanged: onDefectTypeChanged,
              onNoteChanged: onNoteChanged,
              onCapturePhoto: onCapturePhoto,
              noteSuffix: speechAvailable ? _VoiceMicButton(speech: speech, controller: answer.noteController) : null,
            ),
          ],
        ],
      ),
    );
  }
}

class _SegButton extends StatelessWidget {
  const _SegButton({
    required this.label,
    required this.icon,
    required this.active,
    required this.activeColor,
    required this.activeInk,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool active;
  final Color activeColor;
  final Color activeInk;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 44,
        decoration: BoxDecoration(
          color: active ? activeColor : AppColors.surface,
          border: Border.all(color: active ? activeColor : AppColors.border),
          borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 16, color: active ? activeInk : AppColors.muted),
            const SizedBox(width: AppMetrics.spacingSm),
            Text(label, style: text.bodyMedium?.copyWith(color: active ? activeInk : AppColors.muted, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

/// Toggles on-device speech recognition and appends whatever it hears to [controller]'s text --
/// best-effort: if speech isn't available on the device this just doesn't render, never a blocker.
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
