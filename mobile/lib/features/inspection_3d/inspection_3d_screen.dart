import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:signature/signature.dart';
import 'package:uuid/uuid.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import 'body_type.dart';
import 'check_result.dart';
import 'scan_summary_bar.dart';
import 'view_switcher.dart';
import 'vehicle_canvas.dart';
import 'zone.dart';
import 'zone_action_sheet.dart';
import 'zones_data.dart';

/// The 3D-style pre-trip inspection: a tappable vehicle silhouette (see zones_data.dart for the
/// real per-body-type zone content), one zone = one check. Same submission contract as the flat
/// InspectionScreen (POST /inspections, offline outbox on failure) -- only the on-screen
/// interaction differs.
class Inspection3DScreen extends ConsumerStatefulWidget {
  const Inspection3DScreen({super.key, required this.template, required this.vehicle});

  final Map<String, dynamic> template;
  final Map<String, dynamic> vehicle;

  @override
  ConsumerState<Inspection3DScreen> createState() => _Inspection3DScreenState();
}

class _Inspection3DScreenState extends ConsumerState<Inspection3DScreen> {
  final _clientSubmissionId = const Uuid().v4();
  final _startedAt = DateTime.now().toUtc().toIso8601String();
  final _odometerController = TextEditingController();
  final _signatureController = SignatureController(penColor: Colors.white, penStrokeWidth: 3);

  late final VehicleBodyType _bodyType = bodyTypeFromAssetClass(widget.template['asset_class'] as String?) ?? VehicleBodyType.truck;
  late final List<InspectionZone> _zones = zonesForBodyType(_bodyType);
  final Map<String, ZoneAnswer> _answers = {};

  ZoneView _view = ZoneView.side;
  String? _signatureDataUrl;
  bool _submitting = false;
  bool _loadingDefects = true;

  @override
  void initState() {
    super.initState();
    for (final z in _zones) {
      _answers[z.id] = ZoneAnswer();
    }
    _loadOpenDefects();
  }

  @override
  void dispose() {
    _odometerController.dispose();
    _signatureController.dispose();
    super.dispose();
  }

  Future<void> _loadOpenDefects() async {
    final dio = ref.read(apiClientProvider).dio;
    try {
      final r = await dio.get('/vehicles/${widget.vehicle['id']}/open-defects');
      final byNode = Map<String, dynamic>.from(r.data['by_node'] as Map? ?? {});
      for (final entry in byNode.entries) {
        final answer = _answers[entry.key];
        if (answer == null) continue;
        final severity = (entry.value as Map)['severity'] as String?;
        answer.result = severity == 'critical' ? CheckResult.fail : CheckResult.warning;
        answer.note = 'Unresolved from a prior inspection';
      }
    } catch (_) {
      // Best-effort -- a fresh vehicle or an offline load just starts with every zone unanswered.
    } finally {
      if (mounted) setState(() => _loadingDefects = false);
    }
  }

  int get _answeredCount => _answers.values.where((a) => a.result != CheckResult.none).length;
  int get _defectCount => _answers.values.where((a) => a.result == CheckResult.fail || a.result == CheckResult.warning).length;
  bool get _allAnswered => _answeredCount == _zones.length;

  bool get _odometerMissing {
    final v = double.tryParse(_odometerController.text);
    return v == null || v <= 0;
  }

  bool get _canSubmit => !_odometerMissing && _signatureDataUrl != null && _allAnswered;

  Future<void> _openSignaturePad() async {
    _signatureController.clear();
    final result = await showModalBottomSheet<Uint8List?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(AppMetrics.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Sign below'),
            const SizedBox(height: AppMetrics.spacingMd),
            Container(
              height: 200,
              decoration: BoxDecoration(border: Border.all(color: AppColors.border)),
              child: Signature(controller: _signatureController, backgroundColor: AppColors.surface),
            ),
            const SizedBox(height: AppMetrics.spacingMd),
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel'))),
              const SizedBox(width: AppMetrics.spacingSm),
              Expanded(
                child: ElevatedButton(
                  onPressed: () async {
                    if (_signatureController.isEmpty) return;
                    final bytes = await _signatureController.toPngBytes();
                    if (context.mounted) Navigator.pop(context, bytes);
                  },
                  child: const Text('Confirm'),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
    if (result != null) setState(() => _signatureDataUrl = 'data:image/png;base64,${base64Encode(result)}');
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);

    final answers = <Map<String, dynamic>>[];
    for (final zone in _zones) {
      final a = _answers[zone.id]!;
      String value;
      switch (a.result) {
        case CheckResult.pass: value = 'pass';
        case CheckResult.warning: value = 'fail';
        case CheckResult.fail: value = 'fail';
        case CheckResult.na: value = 'na';
        case CheckResult.none: continue;
      }
      answers.add({
        'item_id': zone.id,
        'value': value,
        'note': a.note,
        'photo': a.photoDataUrl,
        'defect_type': a.needsEvidence ? 'general' : null,
        'component_node': zone.id,
        'severity': a.result == CheckResult.fail ? 'critical' : (a.result == CheckResult.warning ? 'warning' : null),
      });
    }

    final payload = {
      'template_id': widget.template['id'],
      'vehicle_id': widget.vehicle['id'],
      'odometer': double.tryParse(_odometerController.text),
      'notes': '',
      'answers': answers,
      'completed_at': DateTime.now().toUtc().toIso8601String(),
      'started_at': _startedAt,
      'signature': _signatureDataUrl,
      'client_submission_id': _clientSubmissionId,
    };

    final dio = ref.read(apiClientProvider).dio;
    try {
      await dio.post('/inspections', data: payload);
      if (mounted) _showResultAndPop('Inspection complete', _defectCount > 0 ? '$_defectCount area(s) flagged.' : 'All areas passed.');
    } on DioException catch (e) {
      if (e.response == null) {
        await ref.read(outboxRepositoryProvider).enqueue(
              id: _clientSubmissionId,
              kind: 'inspection',
              method: 'POST',
              endpoint: '/inspections',
              payload: payload,
            );
        if (mounted) _showResultAndPop('Saved offline', "This inspection will sync automatically once you're back online.");
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to submit. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showResultAndPop(String title, String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              Navigator.of(context).pop();
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final zonesInView = _zones.where((z) => z.view == _view).toList();

    return Scaffold(
      appBar: AppBar(title: Text(widget.template['name'] as String? ?? '3D Inspection')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: AppMetrics.screenPadding),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: AppMetrics.spacingMd),
                    Text('${widget.vehicle['make'] ?? ''} ${widget.vehicle['model'] ?? ''} · ${_bodyType.label}',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: AppMetrics.spacingXs),
                    const Text('Rotate through each view and tap every marker to confirm its condition.'),
                    const SizedBox(height: AppMetrics.spacingMd),
                    ViewSwitcher(active: _view, onChanged: (v) => setState(() => _view = v)),
                    const SizedBox(height: AppMetrics.spacingMd),
                    if (_loadingDefects)
                      const SizedBox(height: AppMetrics.canvasHeight, child: Center(child: CircularProgressIndicator()))
                    else
                      VehicleCanvas(
                        bodyType: _bodyType,
                        view: _view,
                        zones: zonesInView,
                        resultFor: (id) => _answers[id]?.result ?? CheckResult.none,
                        onZoneTap: (zone) => showZoneActionSheet(
                          context: context,
                          zone: zone,
                          answer: _answers[zone.id]!,
                          onChanged: () => setState(() {}),
                        ),
                      ),
                    const SizedBox(height: AppMetrics.spacingMd),
                    ScanSummaryBar(checked: _answeredCount, total: _zones.length, defects: _defectCount),
                    const SizedBox(height: AppMetrics.spacingLg),
                    TextField(
                      controller: _odometerController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Odometer (km) *'),
                    ),
                    const SizedBox(height: AppMetrics.spacingSm),
                    OutlinedButton(
                      onPressed: _openSignaturePad,
                      child: Text(_signatureDataUrl != null ? 'Re-sign' : 'Sign *'),
                    ),
                    if (!_canSubmit)
                      Padding(
                        padding: const EdgeInsets.only(top: AppMetrics.spacingSm),
                        child: Text(
                          'Before you can submit: ${[
                            if (_odometerMissing) 'odometer reading',
                            if (_signatureDataUrl == null) 'signature',
                            if (!_allAnswered) 'every area confirmed',
                          ].join(', ')}.',
                          style: const TextStyle(color: AppColors.danger, fontSize: 12),
                        ),
                      ),
                    const SizedBox(height: AppMetrics.spacingLg),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(AppMetrics.screenPadding, 0, AppMetrics.screenPadding, AppMetrics.spacingMd),
              child: ElevatedButton(
                onPressed: (_canSubmit && !_submitting) ? _submit : null,
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text('Complete inspection${_defectCount > 0 ? ' & flag defects' : ''}'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
