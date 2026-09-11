import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';
import 'package:uuid/uuid.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/defect_fields.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/review_sheet.dart';
import '../../core/widgets/signature_pad.dart';
import '../inspection/inspection_complete_screen.dart';
import 'vehicle_diagram_painter.dart';

const _kViews = ['side', 'front', 'rear', 'top'];
const _kStatuses = ['pass', 'warning', 'critical', 'na'];

class _PartAnswer {
  String? status;
  String defectType = '';
  String note = '';
  String? photoDataUrl;
  final noteController = TextEditingController();
}

Color _statusColor(String? s) {
  switch (s) {
    case 'pass':
      return AppColors.primary;
    case 'warning':
      return AppColors.warning;
    case 'critical':
      return AppColors.danger;
    case 'na':
      return AppColors.muted;
    default:
      return AppColors.surfaceElevated;
  }
}

IconData _statusIcon(String s) => switch (s) {
      'pass' => Icons.check,
      'warning' => Icons.warning_amber_rounded,
      'critical' => Icons.close,
      _ => Icons.remove,
    };

/// Ported from the Fleet Hub reference app's inspection/visual.tsx -- a tap-diagram alternative to
/// the flat checklist: 4 rotatable views (side/front/rear/top) of a line-art vehicle diagram, tap a
/// part marker to record its condition (pass/warning/critical/N/A), same defect-capture rules as the
/// flat screen for warning/critical, review-sheet-gated submit. Takes over the slot the parked 3D
/// concept used to occupy (templates.asset_class), replacing it with this simpler, real diagram.
class InspectionVisualScreen extends ConsumerStatefulWidget {
  const InspectionVisualScreen({super.key, required this.template, required this.vehicle, required this.odometer});

  final Map<String, dynamic> template;
  final Map<String, dynamic> vehicle;
  final double odometer;

  @override
  ConsumerState<InspectionVisualScreen> createState() => _InspectionVisualScreenState();
}

class _InspectionVisualScreenState extends ConsumerState<InspectionVisualScreen> {
  final _clientSubmissionId = const Uuid().v4();
  final _startedAt = DateTime.now().toUtc().toIso8601String();
  final _answers = <String, _PartAnswer>{};
  final _signatureController = SignatureController(penColor: Colors.white, penStrokeWidth: 3);
  final _picker = ImagePicker();
  String _view = 'side';
  String? _validation;

  List<Map<String, dynamic>> get _parts =>
      (widget.template['visual_parts'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList();

  List<Map<String, dynamic>> get _visibleParts => _parts.where((p) => p['view'] == _view).toList();

  int get _doneCount => _parts.where((p) => _answerFor(p['id'] as String).status != null).length;

  _PartAnswer _answerFor(String partId) => _answers.putIfAbsent(partId, () => _PartAnswer());

  @override
  void dispose() {
    _signatureController.dispose();
    for (final a in _answers.values) {
      a.noteController.dispose();
    }
    super.dispose();
  }

  void _changeView(String v) => setState(() => _view = v);

  void _rotateNext() {
    final idx = _kViews.indexOf(_view);
    _changeView(_kViews[(idx + 1) % _kViews.length]);
  }

  Future<void> _capturePhoto(String partId) async {
    final photo = await _picker.pickImage(source: ImageSource.camera, imageQuality: 60);
    if (photo == null) return;
    final bytes = await photo.readAsBytes();
    setState(() => _answerFor(partId).photoDataUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}');
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
        // Reverse geocoding is best-effort.
      }
      return (lat: pos.latitude, lng: pos.longitude, status: 'captured', address: address);
    } catch (_) {
      return (lat: null, lng: null, status: 'unavailable', address: null);
    }
  }

  void _openPart(Map<String, dynamic> part) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surfaceElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppMetrics.radiusLarge)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => _PartSheet(
          part: part,
          answer: _answerFor(part['id'] as String),
          onStatusChanged: (s) => setState(() {
            setSheetState(() {
              _answerFor(part['id'] as String).status = s;
              _validation = null;
            });
          }),
          onDefectTypeChanged: (dt) => setSheetState(() => setState(() => _answerFor(part['id'] as String).defectType = dt)),
          onNoteChanged: (v) => _answerFor(part['id'] as String).note = v,
          onCapturePhoto: () async {
            await _capturePhoto(part['id'] as String);
            setSheetState(() {});
          },
        ),
      ),
    );
  }

  void _onReview() {
    if (_doneCount < _parts.length) {
      setState(() => _validation = 'Inspect all ${_parts.length} parts ($_doneCount done).');
      return;
    }
    for (final p in _parts) {
      final a = _answerFor(p['id'] as String);
      if ((a.status == 'warning' || a.status == 'critical') && (a.defectType.isEmpty || a.note.trim().isEmpty)) {
        setState(() => _validation = 'Warning/critical parts need a category and note.');
        return;
      }
    }
    if (_signatureController.isEmpty) {
      setState(() => _validation = 'Please sign to confirm your inspection.');
      return;
    }
    setState(() => _validation = null);

    final flagged = _parts.where((p) {
      final s = _answerFor(p['id'] as String).status;
      return s == 'warning' || s == 'critical';
    }).map((p) {
      final a = _answerFor(p['id'] as String);
      return FlaggedReviewItem(
        label: p['label'] as String? ?? '',
        status: a.status!,
        category: a.defectType,
        note: a.note,
        hasPhoto: a.photoDataUrl != null,
      );
    }).toList();

    showReviewSheet(context, flagged: flagged, totalCount: _parts.length, onConfirm: _submit);
  }

  Future<void> _submit() async {
    final signatureBytes = await _signatureController.toPngBytes();
    final signatureDataUrl =
        signatureBytes != null ? 'data:image/png;base64,${base64Encode(signatureBytes)}' : null;
    final location = await _captureLocation();

    final hasCritical = _parts.any((p) => _answerFor(p['id'] as String).status == 'critical');
    final hasWarning = _parts.any((p) => _answerFor(p['id'] as String).status == 'warning');
    final overall = hasCritical ? 'critical' : (hasWarning ? 'warning' : 'pass');
    final defectCount =
        _parts.where((p) => const {'warning', 'critical'}.contains(_answerFor(p['id'] as String).status)).length;

    final payload = {
      'template_id': widget.template['id'],
      'vehicle_id': widget.vehicle['id'],
      'odometer': widget.odometer,
      'notes': '',
      'answers': _parts.map((p) {
        final a = _answerFor(p['id'] as String);
        return {
          'item_id': p['id'],
          'value': a.status ?? '',
          'note': a.note,
          'photo': a.photoDataUrl,
          'defect_type': a.defectType.isEmpty ? null : a.defectType,
        };
      }).toList(),
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
        builder: (context) => InspectionCompleteScreen(overallStatus: overall, defectCount: defectCount, queued: queued),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.template['name'] as String? ?? 'Visual Inspection'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: AppMetrics.screenPadding),
            child: Center(
              child: Text('$_doneCount/${_parts.length}', style: text.labelMedium?.copyWith(color: AppColors.primary)),
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
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    border: Border.all(color: AppColors.border),
                    borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                  ),
                  child: Row(
                    children: [
                      for (final v in _kViews)
                        Expanded(
                          child: GestureDetector(
                            onTap: () => _changeView(v),
                            child: Container(
                              height: 40,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: _view == v ? AppColors.primary : Colors.transparent,
                                borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                              ),
                              child: Text(
                                v[0].toUpperCase() + v.substring(1),
                                style: text.bodyMedium?.copyWith(
                                  color: _view == v ? AppColors.primaryInk : AppColors.muted,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppMetrics.spacingMd),
                GestureDetector(
                  onHorizontalDragEnd: (details) {
                    final v = details.primaryVelocity ?? 0;
                    if (v < -200) {
                      final idx = _kViews.indexOf(_view);
                      _changeView(_kViews[(idx + 1) % _kViews.length]);
                    } else if (v > 200) {
                      final idx = _kViews.indexOf(_view);
                      _changeView(_kViews[(idx - 1 + _kViews.length) % _kViews.length]);
                    }
                  },
                  child: AspectRatio(
                    aspectRatio: 1.5,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                      ),
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: CustomPaint(
                              painter: VehicleDiagramPainter(
                                vehicleClass: (widget.vehicle['type'] as String?) ?? 'truck',
                                view: _view,
                              ),
                            ),
                          ),
                          LayoutBuilder(
                            builder: (context, constraints) {
                              return Stack(
                                children: [
                                  for (final p in _visibleParts)
                                    Positioned(
                                      left: (p['x'] as num).toDouble() * constraints.maxWidth - 15,
                                      top: (p['y'] as num).toDouble() * constraints.maxHeight - 15,
                                      child: GestureDetector(
                                        onTap: () => _openPart(p),
                                        child: Container(
                                          width: 30,
                                          height: 30,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: _statusColor(_answerFor(p['id'] as String).status),
                                            border: Border.all(
                                              color: _answerFor(p['id'] as String).status != null
                                                  ? _statusColor(_answerFor(p['id'] as String).status)
                                                  : AppColors.muted,
                                              width: 2,
                                            ),
                                          ),
                                          child: _answerFor(p['id'] as String).status != null
                                              ? Icon(
                                                  _statusIcon(_answerFor(p['id'] as String).status!),
                                                  size: 14,
                                                  color: _answerFor(p['id'] as String).status == 'warning' ||
                                                          _answerFor(p['id'] as String).status == 'na'
                                                      ? AppColors.primaryInk
                                                      : Colors.white,
                                                )
                                              : Center(
                                                  child: Container(
                                                    width: 8,
                                                    height: 8,
                                                    decoration: const BoxDecoration(
                                                      shape: BoxShape.circle,
                                                      color: AppColors.muted,
                                                    ),
                                                  ),
                                                ),
                                        ),
                                      ),
                                    ),
                                ],
                              );
                            },
                          ),
                          Positioned(
                            right: 10,
                            bottom: 10,
                            child: GestureDetector(
                              onTap: _rotateNext,
                              child: Container(
                                width: 44,
                                height: 44,
                                decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.primary),
                                child: const Icon(Icons.refresh, color: AppColors.primaryInk),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppMetrics.spacingSm),
                Text('Drag to spin the vehicle · tap a marker to inspect.',
                    style: text.bodySmall?.copyWith(color: AppColors.muted), textAlign: TextAlign.center),
                const SizedBox(height: AppMetrics.spacingMd),
                Container(
                  padding: const EdgeInsets.all(AppMetrics.spacingMd),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    border: Border.all(color: AppColors.border),
                    borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                  ),
                  child: Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    spacing: AppMetrics.spacingMd,
                    runSpacing: AppMetrics.spacingSm,
                    children: [
                      for (final s in _kStatuses)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 12,
                              height: 12,
                              decoration: BoxDecoration(shape: BoxShape.circle, color: _statusColor(s)),
                            ),
                            const SizedBox(width: AppMetrics.spacingSm),
                            Text(
                              s == 'na' ? 'N/A' : s[0].toUpperCase() + s.substring(1),
                              style: text.labelSmall?.copyWith(color: AppColors.ink),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppMetrics.spacingLg),
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

class _PartSheet extends StatelessWidget {
  const _PartSheet({
    required this.part,
    required this.answer,
    required this.onStatusChanged,
    required this.onDefectTypeChanged,
    required this.onNoteChanged,
    required this.onCapturePhoto,
  });

  final Map<String, dynamic> part;
  final _PartAnswer answer;
  final ValueChanged<String> onStatusChanged;
  final ValueChanged<String> onDefectTypeChanged;
  final ValueChanged<String> onNoteChanged;
  final VoidCallback onCapturePhoto;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final checks = (part['checks'] as List? ?? []).map((c) => Map<String, dynamic>.from(c)).toList();
    final needsDefect = answer.status == 'warning' || answer.status == 'critical';
    answer.noteController.text = answer.note;

    return Padding(
      padding: EdgeInsets.only(
        left: AppMetrics.spacingLg,
        right: AppMetrics.spacingLg,
        top: AppMetrics.spacingLg,
        bottom: AppMetrics.spacingLg + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(part['label'] as String? ?? '', style: text.headlineMedium),
            const SizedBox(height: 4),
            Text(
              '${(part['view'] as String? ?? '').toUpperCase()} VIEW',
              style: text.labelSmall?.copyWith(color: AppColors.primary, letterSpacing: 1),
            ),
            const SizedBox(height: AppMetrics.spacingMd),
            Container(
              padding: const EdgeInsets.all(AppMetrics.spacingMd),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final c in checks)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.primary),
                          ),
                          const SizedBox(width: AppMetrics.spacingSm),
                          Expanded(child: Text(c['label'] as String? ?? '', style: text.bodyMedium?.copyWith(color: AppColors.muted))),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppMetrics.spacingMd),
            Text('CONDITION', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
            const SizedBox(height: AppMetrics.spacingSm),
            Wrap(
              spacing: AppMetrics.spacingSm,
              runSpacing: AppMetrics.spacingSm,
              children: [
                for (final s in _kStatuses)
                  SizedBox(
                    width: (MediaQuery.of(context).size.width - AppMetrics.spacingLg * 2 - AppMetrics.spacingSm) / 2,
                    child: GestureDetector(
                      onTap: () => onStatusChanged(s),
                      child: Container(
                        height: 48,
                        decoration: BoxDecoration(
                          color: answer.status == s ? _statusColor(s) : AppColors.surface,
                          border: Border.all(color: answer.status == s ? _statusColor(s) : AppColors.border),
                          borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(_statusIcon(s), size: 16, color: answer.status == s ? Colors.white : AppColors.muted),
                            const SizedBox(width: AppMetrics.spacingSm),
                            Text(
                              s == 'na' ? 'N/A' : s[0].toUpperCase() + s.substring(1),
                              style: text.bodyMedium?.copyWith(
                                color: answer.status == s ? Colors.white : AppColors.muted,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            if (needsDefect) ...[
              const SizedBox(height: AppMetrics.spacingMd),
              DefectFields(
                defectType: answer.defectType.isEmpty ? null : answer.defectType,
                noteController: answer.noteController,
                photoDataUrl: answer.photoDataUrl,
                onDefectTypeChanged: onDefectTypeChanged,
                onNoteChanged: onNoteChanged,
                onCapturePhoto: onCapturePhoto,
              ),
            ],
            const SizedBox(height: AppMetrics.spacingLg),
            FleetButton(label: 'Done', onPressed: () => Navigator.of(context).pop()),
          ],
        ),
      ),
    );
  }
}
