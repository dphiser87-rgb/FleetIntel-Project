import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';
import 'package:uuid/uuid.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';

/// Checklist item types and defect-capture rules mirror the backend contract (InspectionAnswer /
/// InspectionIn in server.py) and the proven Expo prototype's InspectionScreen.js: a "fail" answer
/// is not submittable without a defect_type, a photo, and a note -- ported here as-is rather than
/// redesigned, since it already matches what the backend/web app expect.
const kDefectTypes = ['tyres', 'engine', 'brakes', 'electrical', 'bodywork', 'general'];

class _Answer {
  String? value;
  String note = '';
  String? photoDataUrl;
  String? defectType;
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
  String? _signatureDataUrl;
  bool _submitting = false;
  final _picker = ImagePicker();

  List<Map<String, dynamic>> get _sections =>
      (widget.template['sections'] as List? ?? []).map((s) => Map<String, dynamic>.from(s)).toList();

  @override
  void dispose() {
    _notesController.dispose();
    _odometerController.dispose();
    _signatureController.dispose();
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

  Future<({double? lat, double? lng, String status})> _captureLocation() async {
    try {
      final permission = await Geolocator.checkPermission();
      var granted = permission;
      if (granted == LocationPermission.denied) {
        granted = await Geolocator.requestPermission();
      }
      if (granted == LocationPermission.denied || granted == LocationPermission.deniedForever) {
        return (lat: null, lng: null, status: 'denied');
      }
      if (!await Geolocator.isLocationServiceEnabled()) {
        return (lat: null, lng: null, status: 'unavailable');
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium),
      ).timeout(const Duration(seconds: 8));
      return (lat: pos.latitude, lng: pos.longitude, status: 'captured');
    } catch (_) {
      return (lat: null, lng: null, status: 'unavailable');
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
      'location_status': location.status,
      'signature': _signatureDataUrl,
      'client_submission_id': _clientSubmissionId,
    };

    final dio = ref.read(apiClientProvider).dio;
    try {
      await dio.post('/inspections', data: payload);
      if (mounted) _showResultAndPop('Inspection complete', _failCount > 0 ? '$_failCount failed item(s) flagged.' : 'All items passed.');
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
        if (mounted) {
          _showResultAndPop('Saved offline', "This inspection will sync automatically once you're back online.");
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to submit. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  int get _failCount =>
      _answers.values.where((a) => (a.value ?? '').toLowerCase() == 'fail').length;

  void _showResultAndPop(String title, String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop(); // close dialog
              Navigator.of(context).pop(); // close inspection screen (pushed outside go_router)
              context.go('/welcome');
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.template['name'] as String? ?? 'Inspection')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('${widget.vehicle['make'] ?? ''} ${widget.vehicle['model'] ?? ''}',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: TextField(
                controller: _odometerController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Odometer (km) *'),
              ),
            ),
          ),
          const SizedBox(height: 12),
          for (final section in _sections) _SectionCard(
            section: section,
            answerFor: _answerFor,
            missingForFail: _missingForFail,
            onCapturePhoto: _capturePhoto,
            onChanged: () => setState(() {}),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: TextField(
                controller: _notesController,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'General notes'),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Signature *'),
                  const SizedBox(height: 8),
                  if (_signatureDataUrl != null)
                    Container(
                      height: 120,
                      decoration: BoxDecoration(border: Border.all(color: AppColors.border)),
                      child: Image.memory(
                        base64Decode(_signatureDataUrl!.split(',').last),
                        fit: BoxFit.contain,
                      ),
                    ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: _openSignaturePad,
                    child: Text(_signatureDataUrl != null ? 'Re-sign' : 'Sign'),
                  ),
                ],
              ),
            ),
          ),
          if (!_canSubmit)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'Before you can submit: ${[
                  if (_odometerMissing) 'odometer reading',
                  if (_signatureDataUrl == null) 'signature',
                  if (_hasUnresolvedFails) 'defect type/photo/note on every failed item',
                ].join(', ')}.',
                style: const TextStyle(color: AppColors.danger, fontSize: 12),
              ),
            ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: (_canSubmit && !_submitting) ? _submit : null,
            child: _submitting
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : Text('Complete inspection${_failCount > 0 ? ' & flag defects' : ''}'),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.section,
    required this.answerFor,
    required this.missingForFail,
    required this.onCapturePhoto,
    required this.onChanged,
  });

  final Map<String, dynamic> section;
  final _Answer Function(String) answerFor;
  final List<String> Function(Map<String, dynamic>) missingForFail;
  final Future<void> Function(String) onCapturePhoto;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final items = (section['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(section['title'] as String? ?? '', style: Theme.of(context).textTheme.titleMedium),
            for (final item in items) _ItemRow(
              item: item,
              answer: answerFor(item['id'] as String),
              onCapturePhoto: onCapturePhoto,
              onChanged: onChanged,
            ),
          ],
        ),
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item, required this.answer, required this.onCapturePhoto, required this.onChanged});

  final Map<String, dynamic> item;
  final _Answer answer;
  final Future<void> Function(String) onCapturePhoto;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final type = item['type'] as String? ?? 'boolean';
    final label = item['label'] as String? ?? '';
    final required = item['required'] == true;
    final isFail = (answer.value ?? '').toLowerCase() == 'fail';

    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.only(top: 12),
      decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label${required ? ' *' : ''}'),
          const SizedBox(height: 8),
          if (type == 'boolean')
            Row(
              children: [
                ChoiceChip(
                  label: const Text('Pass'),
                  selected: answer.value == 'pass',
                  onSelected: (_) { answer.value = 'pass'; onChanged(); },
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Fail'),
                  selected: isFail,
                  selectedColor: AppColors.danger.withValues(alpha: 0.25),
                  onSelected: (_) { answer.value = 'fail'; onChanged(); },
                ),
              ],
            ),
          if (type == 'rating')
            Wrap(
              spacing: 8,
              children: List.generate(5, (i) {
                final n = (i + 1).toString();
                return ChoiceChip(
                  label: Text(n),
                  selected: answer.value == n,
                  onSelected: (_) { answer.value = n; onChanged(); },
                );
              }),
            ),
          if (type == 'text' || type == 'number')
            TextField(
              keyboardType: type == 'number' ? TextInputType.number : TextInputType.text,
              onChanged: (v) => answer.value = v,
              decoration: const InputDecoration(isDense: true),
            ),
          if (!isFail)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: TextField(
                onChanged: (v) { answer.note = v; },
                decoration: const InputDecoration(isDense: true, hintText: 'Note…'),
              ),
            ),
          if (isFail) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              children: kDefectTypes.map((dt) => ChoiceChip(
                    label: Text(dt),
                    selected: answer.defectType == dt,
                    onSelected: (_) { answer.defectType = dt; onChanged(); },
                  )).toList(),
            ),
            const SizedBox(height: 8),
            TextField(
              onChanged: (v) { answer.note = v; onChanged(); },
              decoration: const InputDecoration(isDense: true, hintText: 'Describe the defect… *'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () async { await onCapturePhoto(item['id'] as String); onChanged(); },
              child: Text(answer.photoDataUrl != null ? 'Photo captured' : '+ Photo (required)'),
            ),
            if (answer.photoDataUrl != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Image.memory(
                  base64Decode(answer.photoDataUrl!.split(',').last),
                  width: 64,
                  height: 64,
                  fit: BoxFit.cover,
                ),
              ),
          ],
        ],
      ),
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
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Sign below'),
            const SizedBox(height: 12),
            Container(
              height: 240,
              decoration: BoxDecoration(border: Border.all(color: AppColors.border)),
              child: Signature(controller: controller, backgroundColor: AppColors.surface),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: controller.clear,
                    child: const Text('Clear'),
                  ),
                ),
                const SizedBox(width: 8),
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
