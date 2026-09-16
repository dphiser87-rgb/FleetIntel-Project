import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../l10n/app_localizations.dart';
import '../workshop/workshop_ui.dart';

/// Role-specific landing screen for the Executive role, ported from the FleetHub-Welcome-Screen
/// reference's executive/welcome.tsx -- sits between login and the dashboard, giving a quick
/// "what's the headline number right now" read before diving into the full breakdown.
class ExecutiveWelcomeScreen extends ConsumerStatefulWidget {
  const ExecutiveWelcomeScreen({super.key});

  @override
  ConsumerState<ExecutiveWelcomeScreen> createState() => _ExecutiveWelcomeScreenState();
}

class _ExecutiveWelcomeScreenState extends ConsumerState<ExecutiveWelcomeScreen> {
  bool _loading = true;
  double _monthTotal = 0;
  int _insightCount = 0;
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
        dio.get('/analytics/executive-dashboard', queryParameters: {'range': 'year'}),
        dio.get('/workspace'),
      ]);
      final kpis = (results[0].data as Map<String, dynamic>)['kpis'] as Map<String, dynamic>;
      final total = kpis.entries.where((e) => e.key != 'cost_per_vehicle').fold<double>(0, (s, e) => s + (((e.value as Map<String, dynamic>)['value'] as num?) ?? 0));
      setState(() {
        _monthTotal = total;
        _insightCount = (results[0].data as Map<String, dynamic>)['insight_count'] as int? ?? 0;
        _currency = ((results[1].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final user = ref.watch(authControllerProvider).user;
    final firstName = (user?['name'] as String?)?.split(' ').first ?? 'there';
    final role = (user?['role'] as String?) ?? 'executive';
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppMetrics.spacingLg, AppMetrics.spacingSm, AppMetrics.spacingSm, AppMetrics.spacingSm),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(color: colors.primary, borderRadius: BorderRadius.circular(AppMetrics.radiusSharp)),
                        child: Icon(Icons.local_shipping_rounded, color: colors.onPrimary, size: 16),
                      ),
                      const SizedBox(width: AppMetrics.spacingSm),
                      Text(l10n.appName, style: text.titleSmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w800)),
                    ],
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
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: AppMetrics.spacingSm),
                    Container(
                      decoration: BoxDecoration(color: AppColors.surfaceElevated, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(AppMetrics.radiusMedium)),
                      clipBehavior: Clip.antiAlias,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Image.asset('assets/images/welcome_hero.png', width: double.infinity, height: 130, fit: BoxFit.cover, alignment: Alignment.topCenter),
                          Padding(
                            padding: const EdgeInsets.all(AppMetrics.spacingMd),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('EXECUTIVE VIEW', style: text.labelSmall?.copyWith(color: colors.primary, letterSpacing: 1.4, fontWeight: FontWeight.w800)),
                                const SizedBox(height: AppMetrics.spacingXs),
                                Text('Your cost command centre.', style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                                const SizedBox(height: AppMetrics.spacingXs),
                                Text(
                                  'A single, live picture of what the fleet is costing you — with the insights that need your attention.',
                                  style: text.bodySmall?.copyWith(color: AppColors.muted, height: 1.4),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppMetrics.spacingMd),
                    Text.rich(
                      TextSpan(
                        style: text.bodyMedium?.copyWith(color: AppColors.ink),
                        children: [
                          const TextSpan(text: 'Hi '),
                          TextSpan(text: firstName, style: const TextStyle(fontWeight: FontWeight.w700)),
                          TextSpan(text: ' · $role', style: const TextStyle(color: AppColors.muted)),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppMetrics.spacingLg),
                    Row(
                      children: [
                        Expanded(child: _StatCard(icon: Icons.payments_outlined, label: "This month's spend", value: _loading ? '—' : formatMoney(_monthTotal, _currency))),
                        const SizedBox(width: AppMetrics.spacingSm),
                        Expanded(child: _StatCard(icon: Icons.auto_awesome_outlined, label: 'Insights live', value: _loading ? '—' : '$_insightCount', highlight: _insightCount > 0)),
                      ],
                    ),
                    const SizedBox(height: AppMetrics.spacingLg),
                    SizedBox(
                      width: double.infinity,
                      child: FleetButton(label: 'Open the dashboard', icon: Icons.bar_chart_outlined, onPressed: () => context.go('/executive')),
                    ),
                    const SizedBox(height: AppMetrics.spacingLg),
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

class _StatCard extends StatelessWidget {
  const _StatCard({required this.icon, required this.label, required this.value, this.highlight = false});
  final IconData icon;
  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final accent = highlight ? const Color(0xFFFFCC00) : colors.primary;
    return Container(
      padding: const EdgeInsets.all(AppMetrics.spacingMd),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        border: Border.all(color: highlight ? const Color(0xFFFFCC00).withValues(alpha: 0.4) : AppColors.border),
        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: accent),
          const SizedBox(height: AppMetrics.spacingSm),
          Text(value, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800), maxLines: 1, overflow: TextOverflow.ellipsis),
          Text(label, style: text.bodySmall?.copyWith(color: AppColors.muted, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
