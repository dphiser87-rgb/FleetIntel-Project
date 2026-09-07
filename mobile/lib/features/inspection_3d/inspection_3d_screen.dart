import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:model_viewer_plus/model_viewer_plus.dart';
import 'package:signature/signature.dart';
import 'package:uuid/uuid.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import 'defect_review_sheet.dart';
import 'node_geometry.dart';
import 'node_state.dart';

/// model_viewer_plus (v1.10.0) loads its HTML page exactly once at init and has no rebuild-time
/// diffing -- changing cameraOrbit/cameraTarget/innerModelViewerHtml on the Dart widget after first
/// build has no effect (confirmed by reading model_viewer_plus_mobile.dart: build() just returns the
/// same WebViewWidget around a WebViewController created once in initState). So every runtime change
/// here (hotspot recolor, camera focus-on-defect) goes through the raw WebViewController captured via
/// onWebViewCreated and driven with runJavaScript -- not through Dart widget state.
class Inspection3DScreen extends ConsumerStatefulWidget {
  const Inspection3DScreen({super.key, required this.template, required this.vehicle});

  final Map<String, dynamic> template;
  final Map<String, dynamic> vehicle;

  @override
  ConsumerState<Inspection3DScreen> createState() => _Inspection3DScreenState();
}

enum _Mode { external, internal }

class _Inspection3DScreenState extends ConsumerState<Inspection3DScreen> {
  final _clientSubmissionId = const Uuid().v4();
  final _startedAt = DateTime.now().toUtc().toIso8601String();
  final _odometerController = TextEditingController();
  final _signatureController = SignatureController(penColor: Colors.white, penStrokeWidth: 3);
  final _picker = ImagePicker();
  WebViewController? _webView;
  String? _signatureDataUrl;
  bool _submitting = false;
  bool _loadingDefects = true;
  _Mode _mode = _Mode.external;

  late final String _assetClass = widget.template['asset_class'] as String;
  late final Map<String, List<Map<String, dynamic>>> _nodeChecklist =
      (widget.template['node_checklist'] as Map).map(
    (k, v) => MapEntry(k as String, (v as List).map((e) => Map<String, dynamic>.from(e)).toList()),
  );
  late final Map<String, NodeVec3> _geometry = kNodeGeometry[_assetClass] ?? const {};

  // node -> check_key -> answer
  final Map<String, Map<String, CheckAnswer>> _answers = {};

  @override
  void initState() {
    super.initState();
    for (final node in _nodeChecklist.keys) {
      _answers[node] = {for (final c in _nodeChecklist[node]!) c['key'] as String: CheckAnswer()};
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
        final answers = _answers[entry.key];
        if (answers == null || answers.isEmpty) continue;
        final severity = (entry.value as Map)['severity'] as String?;
        final result = severity == 'critical' ? CheckResult.critical : CheckResult.warning;
        answers[answers.keys.first] = CheckAnswer(result: result, note: 'Unresolved from a prior inspection');
      }
    } catch (_) {
      // Best-effort -- a fresh vehicle or an offline load just starts with everything not_checked.
    } finally {
      if (mounted) setState(() => _loadingDefects = false);
    }
  }

  CheckResult _nodeResult(String node) => worstOf(_answers[node]?.values.map((a) => a.result) ?? const []);

  int get _totalChecks => _nodeChecklist.values.fold(0, (s, l) => s + l.length);
  int get _answeredChecks => _answers.values
      .expand((m) => m.values)
      .where((a) => a.result != CheckResult.notChecked)
      .length;

  List<String> get _criticalOrWarningNodes =>
      _nodeChecklist.keys.where((n) => _nodeResult(n) == CheckResult.critical || _nodeResult(n) == CheckResult.warning).toList();

  bool get _odometerMissing {
    final v = double.tryParse(_odometerController.text);
    return v == null || v <= 0;
  }

  bool get _allRequiredAnswered {
    for (final node in _nodeChecklist.keys) {
      for (final check in _nodeChecklist[node]!) {
        if (check['required'] != true) continue;
        if (_answers[node]![check['key']]!.result == CheckResult.notChecked) return false;
      }
    }
    return true;
  }

  bool get _canSubmit => !_odometerMissing && _signatureDataUrl != null && _allRequiredAnswered;

  String _hotspotHtml() {
    final buf = StringBuffer();
    for (final node in _nodeChecklist.keys) {
      final pos = _geometry[node];
      if (pos == null) continue;
      final color = kNodeColors[_nodeResult(node)];
      buf.writeln(
        '<button id="hs-$node" slot="hotspot-$node" '
        'data-position="${pos.x} ${pos.y} ${pos.z}" data-normal="0 0 1" '
        'style="width:22px;height:22px;border-radius:50%;border:2px solid #131315;'
        'background:$color;box-shadow:0 0 0 2px rgba(255,255,255,0.15);cursor:pointer;padding:0;" '
        'onclick="FlutterHotspot.postMessage(\'$node\')"></button>',
      );
    }
    return buf.toString();
  }

  void _applyMode(_Mode mode) {
    setState(() => _mode = mode);
    final prefix = mode == _Mode.external ? 'EXT_' : 'INT_';
    for (final node in _nodeChecklist.keys) {
      final visible = node.startsWith(prefix);
      _webView?.runJavaScript(
        "var el = document.getElementById('hs-$node'); if (el) el.style.display = '${visible ? 'block' : 'none'}';",
      );
    }
  }

  void _recolorHotspot(String node) {
    final color = kNodeColors[_nodeResult(node)];
    _webView?.runJavaScript(
      "var el = document.getElementById('hs-$node'); if (el) el.style.background = '$color';",
    );
  }

  void focusCamera(String node) {
    final pos = _geometry[node];
    if (pos == null) return;
    _webView?.runJavaScript(
      "var mv = document.querySelector('model-viewer'); "
      "if (mv) { mv.cameraTarget = '${pos.x}m ${pos.y}m ${pos.z}m'; mv.cameraOrbit = '-30deg 75deg 4m'; }",
    );
  }

  Future<void> _openChecklistSheet(String node) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      builder: (context) => _NodeChecklistSheet(
        nodeName: node,
        checks: _nodeChecklist[node]!,
        answers: _answers[node]!,
        picker: _picker,
        onChanged: () {
          setState(() {});
          _recolorHotspot(node);
        },
      ),
    );
  }

  Future<void> _openSignaturePad() async {
    _signatureController.clear();
    final result = await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Sign below'),
            const SizedBox(height: 12),
            Container(
              height: 200,
              decoration: BoxDecoration(border: Border.all(color: AppColors.border)),
              child: Signature(controller: _signatureController, backgroundColor: AppColors.surface),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel'))),
              const SizedBox(width: 8),
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
    for (final node in _nodeChecklist.keys) {
      for (final check in _nodeChecklist[node]!) {
        final key = check['key'] as String;
        final a = _answers[node]![key]!;
        String value;
        switch (a.result) {
          case CheckResult.passed: value = 'pass';
          case CheckResult.warning: value = 'fail';
          case CheckResult.critical: value = 'fail';
          case CheckResult.notApplicable: value = 'na';
          case CheckResult.notChecked: continue;
        }
        answers.add({
          'item_id': '$node.$key',
          'value': value,
          'note': a.note,
          'photo': a.photoDataUrl,
          'defect_type': (a.result == CheckResult.warning || a.result == CheckResult.critical) ? 'general' : null,
          'component_node': node,
          'severity': a.result == CheckResult.critical ? 'critical' : (a.result == CheckResult.warning ? 'warning' : null),
        });
      }
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
      if (mounted) _showResultAndPop('Inspection complete', _criticalOrWarningNodes.isNotEmpty ? '${_criticalOrWarningNodes.length} component(s) flagged.' : 'All components passed.');
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
    final glbPath = 'assets/3d/$_assetClass/${_assetClass}_inspection.glb';
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.template['name'] as String? ?? '3D Inspection'),
        actions: [
          if (_criticalOrWarningNodes.isNotEmpty)
            IconButton(
              icon: Badge(
                label: Text('${_criticalOrWarningNodes.length}'),
                child: const Icon(Icons.report_problem_outlined),
              ),
              tooltip: 'Review defects',
              onPressed: () => showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: AppColors.background,
                builder: (context) => DefectReviewSheet(
                  nodes: _criticalOrWarningNodes,
                  resultFor: _nodeResult,
                  onFocus: (node) {
                    Navigator.pop(context);
                    focusCamera(node);
                  },
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(children: [
              Expanded(
                child: SegmentedButton<_Mode>(
                  segments: const [
                    ButtonSegment(value: _Mode.external, label: Text('External')),
                    ButtonSegment(value: _Mode.internal, label: Text('Internal')),
                  ],
                  selected: {_mode},
                  onSelectionChanged: (s) => _applyMode(s.first),
                ),
              ),
            ]),
          ),
          Expanded(
            child: Stack(
              children: [
                ModelViewer(
                  key: ValueKey(glbPath),
                  src: glbPath,
                  alt: '${widget.vehicle['make'] ?? ''} ${widget.vehicle['model'] ?? ''}',
                  cameraControls: true,
                  disableZoom: false,
                  cameraOrbit: '-25deg 75deg 4m',
                  fieldOfView: '30deg',
                  shadowIntensity: 0.6,
                  backgroundColor: AppColors.surface,
                  innerModelViewerHtml: _hotspotHtml(),
                  javascriptChannels: {
                    JavascriptChannel('FlutterHotspot', onMessageReceived: (msg) {
                      _openChecklistSheet(msg.message);
                    }),
                  },
                  onWebViewCreated: (controller) {
                    _webView = controller;
                    // Apply the initial External/Internal visibility once the page has settled.
                    Future.delayed(const Duration(milliseconds: 600), () => _applyMode(_mode));
                  },
                ),
                if (_loadingDefects)
                  const Positioned(
                    top: 8, left: 8,
                    child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              LinearProgressIndicator(value: _totalChecks == 0 ? 0 : _answeredChecks / _totalChecks),
              const SizedBox(height: 6),
              Text('$_answeredChecks of $_totalChecks checks complete', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
              const SizedBox(height: 12),
              TextField(
                controller: _odometerController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Odometer (km) *'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _openSignaturePad,
                child: Text(_signatureDataUrl != null ? 'Re-sign' : 'Sign *'),
              ),
              if (!_canSubmit)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Before you can submit: ${[
                      if (_odometerMissing) 'odometer reading',
                      if (_signatureDataUrl == null) 'signature',
                      if (!_allRequiredAnswered) 'every required component check',
                    ].join(', ')}.',
                    style: const TextStyle(color: AppColors.danger, fontSize: 12),
                  ),
                ),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: (_canSubmit && !_submitting) ? _submit : null,
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text('Complete inspection${_criticalOrWarningNodes.isNotEmpty ? ' & flag defects' : ''}'),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _NodeChecklistSheet extends StatefulWidget {
  const _NodeChecklistSheet({
    required this.nodeName,
    required this.checks,
    required this.answers,
    required this.picker,
    required this.onChanged,
  });

  final String nodeName;
  final List<Map<String, dynamic>> checks;
  final Map<String, CheckAnswer> answers;
  final ImagePicker picker;
  final VoidCallback onChanged;

  @override
  State<_NodeChecklistSheet> createState() => _NodeChecklistSheetState();
}

class _NodeChecklistSheetState extends State<_NodeChecklistSheet> {
  String _label(String node) => node.replaceFirst(RegExp(r'^(EXT_|INT_)'), '').replaceAll('_', ' ');

  Future<void> _capturePhoto(CheckAnswer a) async {
    final photo = await widget.picker.pickImage(source: ImageSource.camera, imageQuality: 60);
    if (photo == null) return;
    final bytes = await photo.readAsBytes();
    setState(() => a.photoDataUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}');
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          controller: scrollController,
          children: [
            Text(_label(widget.nodeName), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            for (final check in widget.checks) ...[
              _CheckRow(
                check: check,
                answer: widget.answers[check['key']]!,
                onCapturePhoto: () => _capturePhoto(widget.answers[check['key']]!),
                onChanged: () { setState(() {}); widget.onChanged(); },
              ),
              const Divider(),
            ],
            const SizedBox(height: 8),
            ElevatedButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
          ],
        ),
      ),
    );
  }
}

class _CheckRow extends StatelessWidget {
  const _CheckRow({required this.check, required this.answer, required this.onCapturePhoto, required this.onChanged});

  final Map<String, dynamic> check;
  final CheckAnswer answer;
  final VoidCallback onCapturePhoto;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final needsEvidence = answer.result == CheckResult.warning || answer.result == CheckResult.critical;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(check['label'] as String? ?? ''),
        const SizedBox(height: 8),
        Wrap(spacing: 6, children: [
          ChoiceChip(label: const Text('Pass'), selected: answer.result == CheckResult.passed,
              onSelected: (_) { answer.result = CheckResult.passed; onChanged(); }),
          ChoiceChip(label: const Text('Warning'), selected: answer.result == CheckResult.warning,
              selectedColor: AppColors.warning.withValues(alpha: 0.3),
              onSelected: (_) { answer.result = CheckResult.warning; onChanged(); }),
          ChoiceChip(label: const Text('Critical'), selected: answer.result == CheckResult.critical,
              selectedColor: AppColors.danger.withValues(alpha: 0.3),
              onSelected: (_) { answer.result = CheckResult.critical; onChanged(); }),
          ChoiceChip(label: const Text('N/A'), selected: answer.result == CheckResult.notApplicable,
              onSelected: (_) { answer.result = CheckResult.notApplicable; onChanged(); }),
        ]),
        if (needsEvidence) ...[
          const SizedBox(height: 8),
          TextField(
            onChanged: (v) { answer.note = v; onChanged(); },
            controller: TextEditingController(text: answer.note)
              ..selection = TextSelection.collapsed(offset: answer.note.length),
            decoration: const InputDecoration(isDense: true, hintText: 'Describe the issue… *'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: onCapturePhoto,
            child: Text(answer.photoDataUrl != null ? 'Photo captured' : '+ Photo (required)'),
          ),
        ],
      ]),
    );
  }
}
