import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/fleet_card.dart';
import '../workshop/workshop_ui.dart';
import 'executive_charts.dart';

const _kRanges = [
  ('year', 'This year'),
  ('90d', '90 days'),
  ('all', 'All time'),
];

const _kInsightMeta = {
  'warning': (color: AppColors.danger, icon: Icons.warning_amber_rounded),
  'alert': (color: AppColors.danger, icon: Icons.warning_amber_rounded),
  'info': (color: Color(0xFFFFCC00), icon: Icons.insights_outlined),
  'success': (color: Color(0xFF34C759), icon: Icons.check_circle_outline),
};
const _kPriorityColor = {
  'High': AppColors.danger,
  'Medium': Color(0xFFFFCC00),
  'Low': Color(0xFF34C759),
};

/// Mobile port of the FleetHub-Executives reference's executive/index.tsx -- fleet-wide cost command
/// centre for the `executive` role (and `finance`/`admin`, who also have read access to this module),
/// wired to our real /analytics/executive-dashboard endpoints instead of its Mongo prototype.
class ExecutiveDashboardScreen extends ConsumerStatefulWidget {
  const ExecutiveDashboardScreen({super.key});

  @override
  ConsumerState<ExecutiveDashboardScreen> createState() => _ExecutiveDashboardScreenState();
}

class _ExecutiveDashboardScreenState extends ConsumerState<ExecutiveDashboardScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _data;
  String _range = 'year';
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
        dio.get('/analytics/executive-dashboard', queryParameters: {'range': _range}),
        dio.get('/workspace'),
      ]);
      setState(() {
        _data = results[0].data as Map<String, dynamic>;
        _currency = ((results[1].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Could not load the executive dashboard.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final userName = ref.watch(authControllerProvider).user?['name'] as String?;
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final d = _data;

    return Scaffold(
      body: SafeArea(
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
                        Text('Executive', style: text.displayLarge?.copyWith(fontSize: 28)),
                        if (userName != null)
                          Text(userName, style: text.labelMedium?.copyWith(color: colors.primary, fontWeight: FontWeight.w700)),
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
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(AppMetrics.radiusMedium)),
                child: Row(
                  children: [
                    for (final r in _kRanges)
                      Expanded(
                        child: GestureDetector(
                          onTap: () {
                            if (_range == r.$1) return;
                            setState(() => _range = r.$1);
                            _load();
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              color: _range == r.$1 ? AppColors.surfaceElevated : Colors.transparent,
                              borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                            ),
                            alignment: Alignment.center,
                            child: Text(r.$2, style: text.labelMedium?.copyWith(fontWeight: FontWeight.w700, color: _range == r.$1 ? AppColors.ink : AppColors.muted)),
                          ),
                        ),
                      ),
                  ],
                ),
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
                            padding: const EdgeInsets.fromLTRB(AppMetrics.spacingLg, AppMetrics.spacingMd, AppMetrics.spacingLg, AppMetrics.spacingXl * 2),
                            children: [
                              _InsightBanner(count: (d?['insight_count'] as int?) ?? 0, periodLabel: d?['period_label'] as String? ?? ''),
                              const SizedBox(height: AppMetrics.spacingMd),
                              _KpiGrid(kpis: (d?['kpis'] as Map<String, dynamic>?) ?? {}, currency: _currency),
                              const SizedBox(height: AppMetrics.spacingMd),
                              FleetCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Spend trend', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
                                    const SizedBox(height: AppMetrics.spacingMd),
                                    TrendChart(data: (d?['monthly_trend'] as List?) ?? [], currency: _currency),
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
                                    Text('${d?['period_label'] ?? ''} breakdown', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
                                    const SizedBox(height: AppMetrics.spacingMd),
                                    CostDonut(
                                      slices: (d?['ytd_breakdown'] as List?) ?? [],
                                      total: ((d?['ytd_total'] as num?) ?? 0).toDouble(),
                                      currency: _currency,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: AppMetrics.spacingMd),
                              _RankList(
                                title: 'Top vehicles by cost',
                                icon: Icons.local_shipping_outlined,
                                rows: (d?['top_vehicles'] as List?) ?? [],
                                labelKey: 'name',
                                valueKey: 'value',
                                currency: _currency,
                                onRow: (r) => context.push('/executive/vehicle/${r['vehicle_id']}?range=$_range'),
                              ),
                              const SizedBox(height: AppMetrics.spacingMd),
                              _RankList(
                                title: 'Cost by region',
                                icon: Icons.map_outlined,
                                rows: (d?['by_region'] as List?) ?? [],
                                labelKey: 'region',
                                valueKey: 'value',
                                currency: _currency,
                              ),
                              const SizedBox(height: AppMetrics.spacingMd),
                              _RankList(
                                title: 'Top suppliers by spend',
                                icon: Icons.inventory_2_outlined,
                                rows: (d?['top_suppliers'] as List?) ?? [],
                                labelKey: 'supplier',
                                valueKey: 'value',
                                currency: _currency,
                                onRow: (r) => context.push('/executive/supplier?name=${Uri.encodeComponent(r['supplier'] as String)}&range=$_range'),
                              ),
                              const SizedBox(height: AppMetrics.spacingMd),
                              _BoardEmailCard(onSaved: _load),
                              const SizedBox(height: AppMetrics.spacingLg),
                              Text('AI cost intelligence', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                              const SizedBox(height: AppMetrics.spacingMd),
                              if (((d?['insights'] as List?) ?? []).isEmpty)
                                FleetCard(child: Text('No notable cost patterns detected yet.', style: text.bodyMedium?.copyWith(color: AppColors.muted)))
                              else
                                for (final it in (d!['insights'] as List)) _InsightCard(insight: it as Map<String, dynamic>),
                            ],
                          ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InsightBanner extends StatelessWidget {
  const _InsightBanner({required this.count, required this.periodLabel});
  final int count;
  final String periodLabel;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(AppMetrics.spacingMd),
      decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(AppMetrics.radiusMedium)),
      child: Row(
        children: [
          const Icon(Icons.auto_awesome_outlined, size: 18, color: AppColors.primary),
          const SizedBox(width: AppMetrics.spacingSm),
          Expanded(
            child: Text(
              '$count cost ${count == 1 ? 'insight' : 'insights'} live · $periodLabel',
              style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink),
            ),
          ),
        ],
      ),
    );
  }
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.kpis, required this.currency});
  final Map<String, dynamic> kpis;
  final String currency;

  static const _tiles = [
    ('maintenance', 'Fleet maintenance spend'),
    ('tyres', 'Tyre spend'),
    ('parts', 'Spare parts spend'),
    ('cost_per_vehicle', 'Cost per vehicle / month'),
  ];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: AppMetrics.spacingSm,
      mainAxisSpacing: AppMetrics.spacingSm,
      childAspectRatio: 1.55,
      children: [
        for (final t in _tiles)
          Builder(builder: (context) {
            final k = kpis[t.$1] as Map<String, dynamic>?;
            final value = ((k?['value'] as num?) ?? 0).toDouble();
            final delta = (k?['delta_pct'] as num?)?.toDouble() ?? 0;
            final up = delta > 0;
            return FleetCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(t.$2, style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 0.3)),
                  Text(formatMoney(value, currency), style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800, fontSize: 18)),
                  if (delta != 0)
                    Row(
                      children: [
                        Icon(up ? Icons.arrow_upward : Icons.arrow_downward, size: 12, color: up ? AppColors.danger : const Color(0xFF34C759)),
                        const SizedBox(width: 3),
                        Flexible(
                          child: Text(
                            '${delta.abs()}% vs last month',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: text.labelSmall?.copyWith(color: up ? AppColors.danger : const Color(0xFF34C759), fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            );
          }),
      ],
    );
  }
}

class _RankList extends StatelessWidget {
  const _RankList({required this.title, required this.icon, required this.rows, required this.labelKey, required this.valueKey, required this.currency, this.onRow});
  final String title;
  final IconData icon;
  final List<dynamic> rows;
  final String labelKey;
  final String valueKey;
  final String currency;
  final void Function(Map<String, dynamic> row)? onRow;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final maxVal = rows.isEmpty ? 1.0 : rows.map((r) => ((r[valueKey] as num?) ?? 0).toDouble()).reduce((a, b) => a > b ? a : b).clamp(1.0, double.infinity);
    return FleetCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, size: 16, color: AppColors.muted),
            const SizedBox(width: 6),
            Text(title, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
          ]),
          const SizedBox(height: AppMetrics.spacingMd),
          if (rows.isEmpty)
            Text('No data yet.', style: text.bodyMedium?.copyWith(color: AppColors.muted))
          else
            for (var i = 0; i < rows.length; i++) _rankRow(context, i, rows[i] as Map<String, dynamic>, maxVal),
        ],
      ),
    );
  }

  Widget _rankRow(BuildContext context, int i, Map<String, dynamic> r, double maxVal) {
    final text = Theme.of(context).textTheme;
    final label = r[labelKey] as String? ?? 'Unknown';
    final value = ((r[valueKey] as num?) ?? 0).toDouble();
    final row = Padding(
      padding: EdgeInsets.only(bottom: i == rows.length - 1 ? 0 : AppMetrics.spacingSm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('${i + 1}. $label', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink), maxLines: 1, overflow: TextOverflow.ellipsis)),
              Text(formatMoney(value, currency), style: text.bodySmall?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
              if (onRow != null) const Icon(Icons.chevron_right, size: 16, color: AppColors.muted),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: value / maxVal, minHeight: 7, backgroundColor: AppColors.surfaceElevated, valueColor: AlwaysStoppedAnimation(i == 0 ? AppColors.primary : const Color(0xFF3A3A40))),
          ),
        ],
      ),
    );
    if (onRow == null) return row;
    return GestureDetector(onTap: () => onRow!(r), child: row);
  }
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({required this.insight});
  final Map<String, dynamic> insight;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final meta = _kInsightMeta[insight['type'] as String? ?? 'info'] ?? _kInsightMeta['info']!;
    final priority = insight['priority'] as String? ?? 'Low';
    final priorityColor = _kPriorityColor[priority] ?? AppColors.muted;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
      // Flutter's BoxDecoration disallows a borderRadius on a Border with non-uniform side colors, so
      // the colored left accent is a separate strip inside a uniformly-bordered, ClipRRect-rounded
      // container instead of a 4px-wide left BorderSide.
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
        child: Container(
          decoration: BoxDecoration(color: AppColors.surface, border: Border.all(color: AppColors.border)),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(width: 4, color: meta.color),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(AppMetrics.spacingMd),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(meta.icon, size: 18, color: meta.color),
                            const SizedBox(width: 8),
                            Expanded(child: Text(insight['title'] as String? ?? '', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink))),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(color: priorityColor.withValues(alpha: 0.12), border: Border.all(color: priorityColor.withValues(alpha: 0.4)), borderRadius: BorderRadius.circular(4)),
                              child: Text(priority, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: priorityColor, letterSpacing: 0.3)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(insight['message'] as String? ?? '', style: text.bodySmall?.copyWith(color: AppColors.muted, height: 1.4)),
                        const SizedBox(height: 6),
                        Text(insight['impact'] as String? ?? '', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BoardEmailCard extends ConsumerStatefulWidget {
  const _BoardEmailCard({required this.onSaved});
  final VoidCallback onSaved;

  @override
  ConsumerState<_BoardEmailCard> createState() => _BoardEmailCardState();
}

class _BoardEmailCardState extends ConsumerState<_BoardEmailCard> {
  final _controller = TextEditingController();
  bool _saving = false;
  bool _sending = false;
  String? _msg;

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      await dio.put('/analytics/executive-dashboard/settings', data: {'exec_email': _controller.text.trim()});
      setState(() => _msg = 'Recipient saved.');
      widget.onSaved();
    } catch (_) {
      setState(() => _msg = 'Could not save the recipient.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _send() async {
    setState(() => _sending = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      final r = await dio.post('/analytics/executive-dashboard/email-summary');
      setState(() => _msg = 'Sent ${r.data['month']} summary to ${r.data['to']}');
    } catch (_) {
      setState(() => _msg = 'Set a recipient email first, then send.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return FleetCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.receipt_long_outlined, size: 16, color: AppColors.muted),
            const SizedBox(width: 6),
            Text('Month-end board email', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
          ]),
          const SizedBox(height: 6),
          Text("Email the last full month's cost summary to the board.", style: text.bodySmall?.copyWith(color: AppColors.muted)),
          const SizedBox(height: AppMetrics.spacingMd),
          TextField(
            controller: _controller,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(hintText: 'board@yourcompany.com', isDense: true),
          ),
          const SizedBox(height: AppMetrics.spacingMd),
          Row(
            children: [
              Expanded(child: FleetButton(label: _saving ? 'Saving…' : 'Save recipient', isOutlined: true, isLoading: _saving, onPressed: _save)),
              const SizedBox(width: AppMetrics.spacingSm),
              Expanded(child: FleetButton(label: _sending ? 'Sending…' : 'Send now', icon: Icons.send_outlined, isLoading: _sending, onPressed: _send)),
            ],
          ),
          if (_msg != null) ...[
            const SizedBox(height: AppMetrics.spacingSm),
            Text(_msg!, style: text.bodySmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }
}
