import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_card.dart';
import '../../core/widgets/status_badge.dart';
import 'workshop_ui.dart';

const _kFinanceFilters = [
  ('awaiting_approval', 'Awaiting approval'),
  ('po_issued', 'PO issued'),
  ('paid', 'Paid'),
];

const Map<String, Color> kFinanceStatusColors = {
  'awaiting_approval': Color(0xFFFFCC00),
  'po_issued': Color(0xFF3B82F6),
  'paid': Color(0xFF34C759),
};
const Map<String, String> kFinanceStatusLabels = {
  'awaiting_approval': 'Awaiting approval',
  'po_issued': 'PO issued',
  'paid': 'Paid',
};

/// Finance's own read on workshop spend: the financial workflow (quotes needing a Finance decision,
/// purchase orders awaiting payment or paid) instead of the raw job-status board every other
/// workshop role sees. Swapped in by WorkshopBoardScreen when role == 'finance' -- every other role's
/// board is untouched.
class WorkshopFinanceBoardView extends ConsumerStatefulWidget {
  const WorkshopFinanceBoardView({super.key});

  @override
  ConsumerState<WorkshopFinanceBoardView> createState() => _WorkshopFinanceBoardViewState();
}

class _WorkshopFinanceBoardViewState extends ConsumerState<WorkshopFinanceBoardView> {
  bool _loading = true;
  String? _error;
  List<dynamic> _items = [];
  int _myApprovals = 0;
  int _purchaseOrders = 0;
  String _filter = 'all';
  String _currency = 'USD';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([
        dio.get('/workshop/finance-board'),
        dio.get('/workspace'),
      ]);
      final board = results[0].data as Map<String, dynamic>;
      final stats = board['stats'] as Map<String, dynamic>? ?? {};
      setState(() {
        _items = board['items'] as List? ?? [];
        _myApprovals = stats['my_approvals'] as int? ?? 0;
        _purchaseOrders = stats['purchase_orders'] as int? ?? 0;
        _currency = ((results[1].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Could not load the finance board.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final userName = ref.watch(authControllerProvider).user?['name'] as String?;
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final visible = _filter == 'all' ? _items : _items.where((i) => i['financial_status'] == _filter).toList();

    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppMetrics.spacingLg, AppMetrics.spacingMd, AppMetrics.spacingLg, AppMetrics.spacingSm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Finance', style: text.displayLarge?.copyWith(fontSize: 28)),
                      if (userName != null)
                        Text('Cost control & approvals', style: text.labelMedium?.copyWith(color: colors.primary, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.logout_outlined, color: AppColors.muted),
                  tooltip: 'Log out',
                  onPressed: () async {
                    await ref.read(authControllerProvider.notifier).logout();
                    if (context.mounted) context.go('/login');
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Center(child: Text(_error!, style: text.bodyMedium?.copyWith(color: AppColors.muted)))
                      : ListView(
                          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
                          children: [
                            Row(
                              children: [
                                Expanded(child: _FinanceActionTile(icon: Icons.fact_check_outlined, label: 'My approvals', badge: _myApprovals, onTap: () => context.push('/workshop/queue'))),
                                const SizedBox(width: AppMetrics.spacingSm),
                                Expanded(child: _FinanceActionTile(icon: Icons.receipt_long_outlined, label: 'Purchase orders', badge: _purchaseOrders, onTap: () => context.push('/workshop/pos'))),
                                const SizedBox(width: AppMetrics.spacingSm),
                                Expanded(child: _FinanceActionTile(icon: Icons.bar_chart_outlined, label: 'Spend overview', onTap: () => context.push('/workshop/cost-rollup'))),
                              ],
                            ),
                            const SizedBox(height: AppMetrics.spacingMd),
                            SizedBox(
                              height: 40,
                              child: ListView(
                                scrollDirection: Axis.horizontal,
                                children: [
                                  _FilterChip(label: 'All', count: _items.length, active: _filter == 'all', onTap: () => setState(() => _filter = 'all')),
                                  for (final f in _kFinanceFilters)
                                    _FilterChip(
                                      label: f.$2,
                                      count: _items.where((i) => i['financial_status'] == f.$1).length,
                                      active: _filter == f.$1,
                                      onTap: () => setState(() => _filter = f.$1),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(height: AppMetrics.spacingMd),
                            if (visible.isEmpty)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingXl),
                                child: Center(child: Text('Nothing here right now.', style: text.bodyMedium?.copyWith(color: AppColors.muted))),
                              )
                            else
                              for (final item in visible) _FinanceItemCard(item: item as Map<String, dynamic>, currency: _currency),
                            const SizedBox(height: AppMetrics.spacingXl * 2),
                          ],
                        ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FinanceActionTile extends StatelessWidget {
  const _FinanceActionTile({required this.icon, required this.label, required this.onTap, this.badge});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return FleetCard(
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: colors.primary, size: AppMetrics.iconMd),
              const SizedBox(height: AppMetrics.spacingSm),
              Text(label, style: text.labelMedium, maxLines: 2),
            ],
          ),
          if (badge != null && badge! > 0)
            Positioned(
              top: -6, right: -6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: AppColors.danger, borderRadius: BorderRadius.circular(999)),
                child: Text(badge! > 9 ? '9+' : '$badge', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
              ),
            ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.count, required this.active, required this.onTap});
  final String label;
  final int count;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(right: AppMetrics.spacingSm),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: AppMetrics.spacingSm),
          decoration: BoxDecoration(
            color: active ? colors.primary : AppColors.surface,
            border: Border.all(color: active ? colors.primary : AppColors.border),
            borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
          ),
          alignment: Alignment.center,
          child: Text(
            count > 0 ? '$label · $count' : label,
            style: text.labelMedium?.copyWith(color: active ? AppColors.primaryInk : AppColors.ink, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }
}

class _FinanceItemCard extends StatelessWidget {
  const _FinanceItemCard({required this.item, required this.currency});
  final Map<String, dynamic> item;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final status = item['financial_status'] as String? ?? 'awaiting_approval';
    final isQuote = item['kind'] == 'quote';
    final vehicleName = item['vehicle_name'] as String?;
    final partsTotal = (item['parts_total'] as num?)?.toDouble();
    final labourTotal = (item['labour_total'] as num?)?.toDouble();
    final supplier = item['supplier'] as String?;
    final requestedBy = item['requested_by'] as String?;
    final poNumber = item['po_number'] as String?;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
      child: FleetCard(
        onTap: () {
          if (isQuote) {
            context.push('/workshop/job/${item['job_id']}');
          } else {
            context.push('/workshop/pos');
          }
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            StatusBadge(label: (kFinanceStatusLabels[status] ?? status).toUpperCase(), color: kFinanceStatusColors[status] ?? AppColors.muted),
            const SizedBox(height: AppMetrics.spacingSm),
            Text(item['job_title'] as String? ?? 'Untitled job', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Row(
              children: [
                const Icon(Icons.local_shipping_outlined, size: 14, color: AppColors.muted),
                const SizedBox(width: 4),
                Text(vehicleName ?? '—', style: text.bodySmall?.copyWith(color: AppColors.muted)),
              ],
            ),
            const Divider(height: AppMetrics.spacingLg, color: AppColors.border),
            if (isQuote && (partsTotal ?? 0) > 0) _amountRow(text, 'Parts', partsTotal ?? 0),
            if (isQuote && (labourTotal ?? 0) > 0) _amountRow(text, 'Labour', labourTotal ?? 0),
            _amountRow(text, 'Total', (item['amount'] as num?)?.toDouble() ?? 0, emphasize: true),
            if (poNumber != null) ...[
              const SizedBox(height: AppMetrics.spacingXs),
              Text('PO $poNumber', style: text.bodySmall?.copyWith(color: AppColors.muted)),
            ],
            if (supplier != null && supplier.isNotEmpty) ...[
              const SizedBox(height: AppMetrics.spacingXs),
              Text('Supplier: $supplier', style: text.bodySmall?.copyWith(color: AppColors.muted)),
            ],
            if (requestedBy != null && requestedBy.isNotEmpty) ...[
              const SizedBox(height: AppMetrics.spacingXs),
              Text('Requested by $requestedBy', style: text.bodySmall?.copyWith(color: AppColors.muted)),
            ],
            const SizedBox(height: AppMetrics.spacingSm),
            Text(
              isQuote ? 'Review →' : 'View PO →',
              style: text.labelMedium?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
    );
  }

  Widget _amountRow(TextTheme text, String label, double value, {bool emphasize = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            emphasize ? label.toUpperCase() : label,
            style: emphasize
                ? text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)
                : text.bodySmall?.copyWith(color: AppColors.muted),
          ),
          Text(
            formatMoney(value, currency),
            style: emphasize ? text.titleSmall?.copyWith(fontWeight: FontWeight.w800) : text.bodySmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
