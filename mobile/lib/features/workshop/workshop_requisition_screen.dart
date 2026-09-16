import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import 'workshop_ui.dart';

/// Mobile port of the FleetHub-Workshop reference's workshop/requisition/[jobId].tsx -- a stock-aware
/// parts cart. Live stock/shortfall indicators per line so a driver sees, before submitting, whether
/// a request will resolve instantly (Workshop Manager approval only) or need to also climb the
/// Ops->Finance quote chain.
class WorkshopRequisitionScreen extends ConsumerStatefulWidget {
  const WorkshopRequisitionScreen({super.key, required this.jobId});
  final String jobId;

  @override
  ConsumerState<WorkshopRequisitionScreen> createState() => _WorkshopRequisitionScreenState();
}

class _WorkshopRequisitionScreenState extends ConsumerState<WorkshopRequisitionScreen> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  List<dynamic> _parts = [];
  String _category = 'All';
  final Map<String, int> _qty = {};
  String _currency = 'USD';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([dio.get('/parts'), dio.get('/workspace')]);
      setState(() {
        _parts = results[0].data as List;
        _currency = ((results[1].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  List<String> get _categories => ['All', ...{for (final p in _parts) (p['category'] as String?) ?? 'Other'}.toList()..sort()];

  bool get _anyShortfall => _qty.entries.any((e) {
        final p = _parts.firstWhere((p) => p['id'].toString() == e.key, orElse: () => null);
        if (p == null) return false;
        return e.value > ((p['stock'] as num?)?.toInt() ?? 0);
      });

  double get _total => _qty.entries.fold(0, (sum, e) {
        final p = _parts.firstWhere((p) => p['id'].toString() == e.key, orElse: () => null);
        if (p == null) return sum;
        return sum + e.value * ((p['unit_cost'] as num?)?.toDouble() ?? 0);
      });

  Future<void> _submit() async {
    final items = _qty.entries.where((e) => e.value > 0).map((e) => {'part_id': e.key, 'qty_requested': e.value}).toList();
    if (items.isEmpty || _submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider).dio;
      await dio.post('/maintenance/${widget.jobId}/parts-requisitions', data: {'items': items});
      if (mounted) context.pop();
    } catch (_) {
      setState(() => _error = 'Could not submit requisition.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final visibleParts = _category == 'All' ? _parts : _parts.where((p) => ((p['category'] as String?) ?? 'Other') == _category).toList();
    final selectedCount = _qty.values.where((v) => v > 0).length;

    return Scaffold(
      appBar: AppBar(title: const Text('Request parts'), centerTitle: true),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  SizedBox(
                    height: 44,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
                      children: [
                        for (final c in _categories)
                          Padding(
                            padding: const EdgeInsets.only(right: AppMetrics.spacingSm),
                            child: GestureDetector(
                              onTap: () => setState(() => _category = c),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: AppMetrics.spacingSm),
                                decoration: BoxDecoration(
                                  color: _category == c ? colors.primary : AppColors.surface,
                                  border: Border.all(color: _category == c ? colors.primary : AppColors.border),
                                  borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                                ),
                                alignment: Alignment.center,
                                child: Text(c, style: text.labelMedium?.copyWith(color: _category == c ? AppColors.primaryInk : AppColors.ink, fontWeight: FontWeight.w700)),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(AppMetrics.spacingLg, AppMetrics.spacingMd, AppMetrics.spacingLg, 140),
                      itemCount: visibleParts.length,
                      itemBuilder: (context, i) {
                        final p = visibleParts[i];
                        final id = p['id'].toString();
                        final stock = (p['stock'] as num?)?.toInt() ?? 0;
                        final qty = _qty[id] ?? 0;
                        final shortfall = qty > stock ? qty - stock : 0;
                        return Container(
                          margin: const EdgeInsets.only(bottom: AppMetrics.spacingSm),
                          padding: const EdgeInsets.all(AppMetrics.spacingMd),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            border: Border.all(color: qty > 0 ? colors.primary : AppColors.border),
                            borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(p['name'] as String? ?? '', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                                    Text('${p['sku'] ?? ''} · ${formatMoney(p['unit_cost'] as num?, _currency)}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                                    const SizedBox(height: 2),
                                    Row(
                                      children: [
                                        Container(width: 6, height: 6, decoration: BoxDecoration(shape: BoxShape.circle, color: stock > 0 ? AppColors.primary : AppColors.danger)),
                                        const SizedBox(width: 4),
                                        Text(stock > 0 ? '$stock in stock' : 'Out of stock', style: text.bodySmall?.copyWith(color: stock > 0 ? AppColors.primary : AppColors.danger)),
                                        if (shortfall > 0) Text(' · shortfall of $shortfall', style: text.bodySmall?.copyWith(color: AppColors.warning)),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.remove_circle_outline),
                                onPressed: qty > 0 ? () => setState(() => _qty[id] = qty - 1) : null,
                              ),
                              SizedBox(width: 24, child: Text('$qty', textAlign: TextAlign.center, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800))),
                              IconButton(
                                icon: Icon(Icons.add_circle, color: colors.primary),
                                onPressed: () => setState(() => _qty[id] = qty + 1),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(AppMetrics.spacingLg, AppMetrics.spacingMd, AppMetrics.spacingLg, MediaQuery.of(context).padding.bottom + AppMetrics.spacingMd),
        decoration: const BoxDecoration(color: AppColors.surface, border: Border(top: BorderSide(color: AppColors.border))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_anyShortfall && selectedCount > 0)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: AppMetrics.spacingSm),
                padding: const EdgeInsets.all(AppMetrics.spacingSm),
                decoration: BoxDecoration(color: AppColors.warning.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(AppMetrics.radiusSharp)),
                child: Text(
                  'Some quantities exceed stock — the shortfall will need Operations + Finance approval.',
                  style: text.bodySmall?.copyWith(color: AppColors.warning),
                ),
              ),
            if (_error != null) Padding(padding: const EdgeInsets.only(bottom: AppMetrics.spacingSm), child: Text(_error!, style: text.bodySmall?.copyWith(color: AppColors.danger))),
            Row(
              children: [
                Expanded(child: Text('$selectedCount item(s)', style: text.bodyMedium)),
                Text(formatMoney(_total, _currency), style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: AppMetrics.spacingSm),
            SizedBox(
              width: double.infinity,
              child: FleetButton(label: 'Submit for approval', isLoading: _submitting, onPressed: selectedCount == 0 ? null : _submit),
            ),
          ],
        ),
      ),
    );
  }
}
