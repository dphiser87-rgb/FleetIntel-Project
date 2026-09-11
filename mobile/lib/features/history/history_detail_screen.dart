import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/status_chip.dart';

/// Ported from the Fleet Hub reference app's history/[id].tsx -- defects-first, then every check,
/// for one past inspection (GET /inspections/{id}, driver-scoped server-side).
class HistoryDetailScreen extends ConsumerStatefulWidget {
  const HistoryDetailScreen({super.key, required this.inspectionId});

  final String inspectionId;

  @override
  ConsumerState<HistoryDetailScreen> createState() => _HistoryDetailScreenState();
}

class _HistoryDetailScreenState extends ConsumerState<HistoryDetailScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _detail;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final response = await dio.get('/inspections/${widget.inspectionId}');
      setState(() {
        _detail = Map<String, dynamic>.from(response.data);
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Inspection Detail')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : (_error != null || _detail == null)
              ? Center(
                  child: Text("Couldn't load this inspection.", style: text.bodyMedium?.copyWith(color: AppColors.muted)),
                )
              : _buildDetail(context, _detail!),
    );
  }

  Widget _buildDetail(BuildContext context, Map<String, dynamic> d) {
    final text = Theme.of(context).textTheme;
    final answers = ((d['answers'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
    final defects = answers.where((a) => (a['value'] as String? ?? '').toLowerCase() != 'pass' && (a['value'] as String? ?? '').isNotEmpty && (a['value'] as String? ?? '').toLowerCase() != 'na').toList();
    final failCount = (d['fail_count'] as num? ?? 0).toInt();
    final overall = failCount > 0 ? 'critical' : 'pass';

    // Snapshot template stores item labels alongside sections; build a lookup so this screen can
    // show a human label instead of a raw item_id.
    final labelById = <String, String>{};
    final snapshot = d['template_snapshot'] as Map?;
    if (snapshot != null) {
      for (final s in ((snapshot['sections'] as List?) ?? [])) {
        final section = Map<String, dynamic>.from(s as Map);
        for (final item in ((section['items'] as List?) ?? [])) {
          final map = Map<String, dynamic>.from(item);
          labelById[map['id'] as String? ?? ''] = map['label'] as String? ?? '';
        }
      }
    }
    String labelFor(Map<String, dynamic> a) => labelById[a['item_id']] ?? (a['item_id'] as String? ?? '');

    return ListView(
      padding: const EdgeInsets.all(AppMetrics.spacingLg),
      children: [
        Container(
          padding: const EdgeInsets.all(AppMetrics.spacingLg),
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            border: Border.all(color: AppColors.border),
            borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text((d['template_name'] as String?) ?? 'Inspection', style: text.titleLarge)),
                  StatusChip(status: overall),
                ],
              ),
              const SizedBox(height: AppMetrics.spacingMd),
              Container(
                padding: const EdgeInsets.only(top: AppMetrics.spacingMd),
                decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
                child: Row(
                  children: [
                    _Meta(label: 'Odometer', value: '${((d['odometer'] as num?) ?? 0).toInt()} km'),
                    _Meta(label: 'Defects', value: '$failCount'),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (defects.isNotEmpty) ...[
          const SizedBox(height: AppMetrics.spacingLg),
          Text('DEFECTS LOGGED', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
          const SizedBox(height: AppMetrics.spacingSm),
          for (final a in defects)
            Container(
              margin: const EdgeInsets.only(bottom: AppMetrics.spacingSm),
              padding: const EdgeInsets.all(AppMetrics.spacingMd),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                border: Border(left: BorderSide(color: AppColors.danger, width: 3)),
                borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(labelFor(a), style: text.titleSmall?.copyWith(color: AppColors.ink))),
                      StatusChip(status: (a['value'] as String?) ?? ''),
                    ],
                  ),
                  if ((a['defect_type'] as String?)?.isNotEmpty ?? false) ...[
                    const SizedBox(height: AppMetrics.spacingSm),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingSm, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                      ),
                      child: Text(a['defect_type'] as String,
                          style: text.labelSmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w700)),
                    ),
                  ],
                  if ((a['note'] as String?)?.isNotEmpty ?? false) ...[
                    const SizedBox(height: AppMetrics.spacingSm),
                    Text(a['note'] as String, style: text.bodyMedium?.copyWith(color: AppColors.muted)),
                  ],
                ],
              ),
            ),
        ],
        const SizedBox(height: AppMetrics.spacingLg),
        Text('ALL CHECKS (${answers.length})', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
        const SizedBox(height: AppMetrics.spacingSm),
        for (final a in answers)
          Container(
            margin: const EdgeInsets.only(bottom: AppMetrics.spacingSm),
            padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: AppMetrics.spacingMd),
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
            ),
            child: Row(
              children: [
                Expanded(child: Text(labelFor(a), style: text.bodyMedium?.copyWith(color: AppColors.muted))),
                StatusChip(status: (a['value'] as String?) ?? ''),
              ],
            ),
          ),
      ],
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 0.6)),
          const SizedBox(height: 2),
          Text(value, style: text.titleSmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
