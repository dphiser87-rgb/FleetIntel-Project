import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_card.dart';
import 'workshop_ui.dart';

/// Mobile port of the reference's workshop/cost-rollup.tsx -- per-vehicle parts+PO spend, top-spend
/// vehicle flagged and bar-highlighted in red.
class WorkshopCostRollupScreen extends ConsumerStatefulWidget {
  const WorkshopCostRollupScreen({super.key});

  @override
  ConsumerState<WorkshopCostRollupScreen> createState() => _WorkshopCostRollupScreenState();
}

class _WorkshopCostRollupScreenState extends ConsumerState<WorkshopCostRollupScreen> {
  bool _loading = true;
  List<dynamic> _vehicles = [];
  double _grandTotal = 0;
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
      final response = await dio.get('/workshop/cost-rollup');
      final data = response.data as Map<String, dynamic>;
      setState(() {
        _vehicles = data['vehicles'] as List;
        _grandTotal = (data['grand_total'] as num?)?.toDouble() ?? 0;
        _currency = data['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final maxTotal = _vehicles.isEmpty
        ? 1.0
        : _vehicles.map((v) => (v['total'] as num).toDouble()).reduce((a, b) => a > b ? a : b).clamp(1.0, double.infinity);

    return Scaffold(
      appBar: AppBar(title: const Text('Cost rollup'), centerTitle: true),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(AppMetrics.spacingLg),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(AppMetrics.spacingMd),
                      decoration: BoxDecoration(border: Border.all(color: colors.primary), borderRadius: BorderRadius.circular(AppMetrics.radiusSharp)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('TOTAL PARTS SPEND · ALL VEHICLES', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
                          const SizedBox(height: 4),
                          Text(formatMoney(_grandTotal, _currency), style: text.displayLarge?.copyWith(fontSize: 30)),
                          const SizedBox(height: 4),
                          Text('Stock used + purchased parts (paid POs)', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppMetrics.spacingLg),
                    if (_vehicles.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingXl),
                        child: Center(child: Text('No spend recorded yet.', style: text.bodyMedium?.copyWith(color: AppColors.muted))),
                      )
                    else
                      for (var i = 0; i < _vehicles.length; i++) _VehicleRow(v: _vehicles[i], isTop: i == 0, maxTotal: maxTotal, currency: _currency),
                  ],
                ),
              ),
      ),
    );
  }
}

class _VehicleRow extends StatelessWidget {
  const _VehicleRow({required this.v, required this.isTop, required this.maxTotal, required this.currency});
  final Map<String, dynamic> v;
  final bool isTop;
  final double maxTotal;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final total = (v['total'] as num?)?.toDouble() ?? 0;
    final pct = (total / maxTotal).clamp(0.0, 1.0);
    final barColor = isTop && total > 0 ? AppColors.danger : AppColors.primary;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
      child: FleetCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.local_shipping_outlined, size: 16, color: AppColors.muted),
                const SizedBox(width: 4),
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: text.bodyMedium,
                      children: [
                        TextSpan(text: '${v['registration'] ?? v['name'] ?? ''} ', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.ink)),
                        TextSpan(text: v['vehicle_class'] as String? ?? '', style: const TextStyle(color: AppColors.muted)),
                      ],
                    ),
                  ),
                ),
                if (isTop && total > 0)
                  Container(
                    margin: const EdgeInsets.only(right: AppMetrics.spacingSm),
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(AppMetrics.radiusSharp)),
                    child: const Text('TOP SPEND', style: TextStyle(color: AppColors.danger, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                  ),
                Text(formatMoney(total, currency), style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: AppMetrics.spacingSm),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: pct, minHeight: 8, backgroundColor: AppColors.surfaceElevated, valueColor: AlwaysStoppedAnimation(barColor)),
            ),
            const SizedBox(height: AppMetrics.spacingSm),
            Row(
              children: [
                Text('${v['job_count']} job(s)', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                const SizedBox(width: AppMetrics.spacingSm),
                Text('Stock ${formatMoney(v['parts_cost'] as num?, currency)}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                const SizedBox(width: AppMetrics.spacingSm),
                Text('Purchased ${formatMoney(v['po_paid'] as num?, currency)}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
