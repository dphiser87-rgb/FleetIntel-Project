import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_card.dart';
import '../workshop/workshop_ui.dart';
import 'executive_charts.dart';

/// Supplier drill-down -- mobile port of FleetHub-Executives' executive/supplier.tsx.
class ExecutiveSupplierScreen extends ConsumerStatefulWidget {
  const ExecutiveSupplierScreen({super.key, required this.supplierName, required this.range});
  final String supplierName;
  final String range;

  @override
  ConsumerState<ExecutiveSupplierScreen> createState() => _ExecutiveSupplierScreenState();
}

class _ExecutiveSupplierScreenState extends ConsumerState<ExecutiveSupplierScreen> {
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
        dio.get('/analytics/executive-dashboard/supplier', queryParameters: {'name': widget.supplierName, 'range': widget.range}),
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

    return Scaffold(
      appBar: AppBar(title: Text(widget.supplierName, maxLines: 1, overflow: TextOverflow.ellipsis), centerTitle: true),
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
                        Row(children: [
                          const Icon(Icons.inventory_2_outlined, size: 18, color: AppColors.primary),
                          const SizedBox(width: 8),
                          Text(d['supplier'] as String? ?? '', style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                        ]),
                        const SizedBox(height: AppMetrics.spacingSm),
                        Text('${(d['period_label'] as String? ?? '').toUpperCase()} SPEND', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
                        Text(formatMoney(d['total'] as num?, _currency), style: text.displayLarge?.copyWith(fontSize: 30)),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppMetrics.spacingMd),
                  FleetCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('What we buy from them', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
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
                          const Icon(Icons.local_shipping_outlined, size: 16, color: AppColors.muted),
                          const SizedBox(width: 6),
                          Text('Vehicles serviced', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                        ]),
                        const SizedBox(height: AppMetrics.spacingMd),
                        if (((d['top_vehicles'] as List?) ?? []).isEmpty)
                          Text('No vehicle spend in this period.', style: text.bodyMedium?.copyWith(color: AppColors.muted))
                        else
                          for (final v in (d['top_vehicles'] as List))
                            GestureDetector(
                              onTap: () => context.push('/executive/vehicle/${v['vehicle_id']}?range=${widget.range}'),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(vertical: 6),
                                child: Row(children: [
                                  Expanded(child: Text(v['name'] as String? ?? '', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
                                  Text(formatMoney(v['value'] as num?, _currency), style: text.bodySmall?.copyWith(fontWeight: FontWeight.w800)),
                                  const SizedBox(width: 4),
                                  const Icon(Icons.chevron_right, size: 16, color: AppColors.muted),
                                ]),
                              ),
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
                          const Icon(Icons.receipt_long_outlined, size: 16, color: AppColors.muted),
                          const SizedBox(width: 6),
                          Text('Paid purchase orders (${(d['purchase_orders'] as List?)?.length ?? 0})', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                        ]),
                        const SizedBox(height: AppMetrics.spacingMd),
                        if (((d['purchase_orders'] as List?) ?? []).isEmpty)
                          Text('No paid POs to this supplier yet.', style: text.bodyMedium?.copyWith(color: AppColors.muted))
                        else
                          for (final p in (d['purchase_orders'] as List))
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              child: Row(children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(p['po_number'] as String? ?? '', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
                                      Text(p['job_title'] as String? ?? '—', style: text.bodySmall?.copyWith(color: AppColors.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
                                    ],
                                  ),
                                ),
                                Text(formatMoney(p['amount'] as num?, _currency), style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
                              ]),
                            ),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
