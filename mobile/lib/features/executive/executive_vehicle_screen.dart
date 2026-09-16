import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_card.dart';
import '../workshop/workshop_ui.dart';
import 'executive_charts.dart';

/// Vehicle drill-down -- mobile port of FleetHub-Executives' executive/vehicle/[id].tsx.
class ExecutiveVehicleScreen extends ConsumerStatefulWidget {
  const ExecutiveVehicleScreen({super.key, required this.vehicleId, required this.range});
  final String vehicleId;
  final String range;

  @override
  ConsumerState<ExecutiveVehicleScreen> createState() => _ExecutiveVehicleScreenState();
}

class _ExecutiveVehicleScreenState extends ConsumerState<ExecutiveVehicleScreen> {
  bool _loading = true;
  Map<String, dynamic>? _data;
  String _currency = 'USD';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([
        dio.get('/analytics/executive-dashboard/vehicle/${widget.vehicleId}', queryParameters: {'range': widget.range}),
        dio.get('/workspace'),
      ]);
      setState(() {
        _data = results[0].data as Map<String, dynamic>;
        _currency = ((results[1].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final d = _data;
    final vehicle = d?['vehicle'] as Map<String, dynamic>?;

    return Scaffold(
      appBar: AppBar(title: Text(vehicle?['registration'] as String? ?? 'Vehicle'), centerTitle: true),
      body: SafeArea(
        child: _loading || d == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(AppMetrics.spacingLg),
                children: [
                  Container(
                    padding: const EdgeInsets.all(AppMetrics.spacingLg),
                    decoration: BoxDecoration(color: AppColors.surface, border: Border.all(color: AppColors.primary), borderRadius: BorderRadius.circular(AppMetrics.radiusMedium)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(vehicle?['name'] as String? ?? '', style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                        Text('${vehicle?['vehicle_class'] ?? ''} · ${vehicle?['region'] ?? '—'}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                        const SizedBox(height: AppMetrics.spacingMd),
                        Text('${(d['period_label'] as String? ?? '').toUpperCase()} SPEND', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
                        Text(formatMoney(d['total'] as num?, _currency), style: text.displayLarge?.copyWith(fontSize: 30)),
                        if (vehicle?['odometer'] != null)
                          Text('${vehicle!['odometer']} km', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppMetrics.spacingMd),
                  FleetCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Cost breakdown', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: AppMetrics.spacingMd),
                        CostDonut(slices: (d['breakdown'] as List?) ?? [], total: ((d['total'] as num?) ?? 0).toDouble(), currency: _currency, centerLabel: 'SPEND'),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppMetrics.spacingMd),
                  FleetCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Spend trend', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: AppMetrics.spacingMd),
                        TrendChart(data: (d['monthly_trend'] as List?) ?? [], currency: _currency),
                        const SizedBox(height: AppMetrics.spacingMd),
                        const TrendLegend(),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppMetrics.spacingMd),
                  FleetCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          const Icon(Icons.inventory_2_outlined, size: 16, color: AppColors.muted),
                          const SizedBox(width: 6),
                          Text('Top suppliers', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                        ]),
                        const SizedBox(height: AppMetrics.spacingMd),
                        if (((d['top_suppliers'] as List?) ?? []).isEmpty)
                          Text('No supplier spend in this period.', style: text.bodyMedium?.copyWith(color: AppColors.muted))
                        else
                          for (final s in (d['top_suppliers'] as List))
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Row(children: [
                                Expanded(child: Text(s['supplier'] as String? ?? '', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
                                Text(formatMoney(s['value'] as num?, _currency), style: text.bodySmall?.copyWith(fontWeight: FontWeight.w800)),
                              ]),
                            ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppMetrics.spacingMd),
                  FleetCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          const Icon(Icons.assignment_outlined, size: 16, color: AppColors.muted),
                          const SizedBox(width: 6),
                          Text('Workshop jobs (${(d['jobs'] as List?)?.length ?? 0})', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                        ]),
                        const SizedBox(height: AppMetrics.spacingMd),
                        if (((d['jobs'] as List?) ?? []).isEmpty)
                          Text('No workshop jobs recorded.', style: text.bodyMedium?.copyWith(color: AppColors.muted))
                        else
                          for (final j in (d['jobs'] as List))
                            _JobRow(job: j as Map<String, dynamic>, currency: _currency, onTap: () => context.push('/workshop/job/${j['id']}')),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _JobRow extends StatelessWidget {
  const _JobRow({required this.job, required this.currency, required this.onTap});
  final Map<String, dynamic> job;
  final String currency;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final statusMeta = kJobStatusColors[job['status'] as String? ?? 'pending'] ?? AppColors.muted;
    final priorityColor = kPriorityColors[job['priority'] as String? ?? 'low'] ?? AppColors.muted;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppMetrics.spacingSm),
        padding: const EdgeInsets.all(AppMetrics.spacingMd),
        decoration: BoxDecoration(color: AppColors.background, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(AppMetrics.radiusMedium)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: priorityColor, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text((job['priority'] as String? ?? '').toUpperCase(), style: text.labelSmall?.copyWith(color: priorityColor, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text(kJobStatusLabels[job['status'] as String? ?? ''] ?? '', style: text.labelSmall?.copyWith(color: statusMeta, fontWeight: FontWeight.w800)),
            ]),
            const SizedBox(height: 4),
            Row(children: [
              Expanded(child: Text(job['title'] as String? ?? '', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
              Text(formatMoney(job['parts_cost'] as num?, currency), style: text.bodySmall?.copyWith(fontWeight: FontWeight.w800)),
            ]),
          ],
        ),
      ),
    );
  }
}
