import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../l10n/app_localizations.dart';

/// Role-specific landing screen for the Workshop roles, ported from the FleetHub-Welcome-Screen
/// reference's workshop/welcome.tsx -- sits between login and the job board, giving a quick
/// "what's on me right now" read (open jobs, items waiting on this person) before diving in.
const Map<String, ({String title, String copy})> _kRoleBlurb = {
  'mechanic': (title: 'Your workshop, at a glance.', copy: 'Pick up your jobs, request the parts you need and track every approval in one place.'),
  'workshop_head': (title: 'Keep the bay moving.', copy: 'Approve parts requisitions, watch stock and make sure nothing waits on you.'),
  'operations_manager': (title: 'Operations control.', copy: 'Review shortfall quotes before they head to Finance and keep spend accountable.'),
  'finance': (title: 'Every rand accounted for.', copy: 'Approve quotes, issue purchase orders and settle payments with proof on file.'),
  'admin': (title: 'Full workshop oversight.', copy: 'Move any job through any stage and keep the whole operation flowing.'),
};

class WorkshopWelcomeScreen extends ConsumerStatefulWidget {
  const WorkshopWelcomeScreen({super.key});

  @override
  ConsumerState<WorkshopWelcomeScreen> createState() => _WorkshopWelcomeScreenState();
}

class _WorkshopWelcomeScreenState extends ConsumerState<WorkshopWelcomeScreen> {
  bool _loading = true;
  int _openJobs = 0;
  int _waiting = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([dio.get('/maintenance'), dio.get('/workshop/queue')]);
      final jobs = results[0].data as List;
      setState(() {
        _openJobs = jobs.where((j) => j['status'] != 'completed').length;
        _waiting = (results[1].data as Map<String, dynamic>)['count'] as int? ?? 0;
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
    final role = (user?['role'] as String?) ?? 'mechanic';
    final blurb = _kRoleBlurb[role] ?? _kRoleBlurb['mechanic']!;
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
                                Text('WORKSHOP MODULE', style: text.labelSmall?.copyWith(color: colors.primary, letterSpacing: 1.4, fontWeight: FontWeight.w800)),
                                const SizedBox(height: AppMetrics.spacingXs),
                                Text(blurb.title, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                                const SizedBox(height: AppMetrics.spacingXs),
                                Text(blurb.copy, style: text.bodySmall?.copyWith(color: AppColors.muted, height: 1.4)),
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
                        Expanded(child: _StatCard(icon: Icons.inventory_2_outlined, label: 'Open jobs', value: _loading ? '—' : '$_openJobs', onTap: () => context.go('/workshop'))),
                        const SizedBox(width: AppMetrics.spacingSm),
                        Expanded(child: _StatCard(icon: Icons.inbox_outlined, label: 'Waiting on you', value: _loading ? '—' : '$_waiting', highlight: _waiting > 0, onTap: () => context.push('/workshop/queue'))),
                      ],
                    ),
                    const SizedBox(height: AppMetrics.spacingLg),
                    SizedBox(
                      width: double.infinity,
                      child: FleetButton(label: 'Go to the workshop board', icon: Icons.list_alt_outlined, onPressed: () => context.go('/workshop')),
                    ),
                    const SizedBox(height: AppMetrics.spacingSm),
                    SizedBox(
                      width: double.infinity,
                      child: FleetButton(label: "See what's waiting on me", icon: Icons.inbox_outlined, isOutlined: true, onPressed: () => context.push('/workshop/queue')),
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
  const _StatCard({required this.icon, required this.label, required this.value, required this.onTap, this.highlight = false});
  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final accent = highlight ? AppColors.danger : colors.primary;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(AppMetrics.spacingMd),
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          border: Border.all(color: highlight ? AppColors.danger.withValues(alpha: 0.4) : AppColors.border),
          borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: accent),
            const SizedBox(height: AppMetrics.spacingSm),
            Text(value, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            Text(label, style: text.bodySmall?.copyWith(color: AppColors.muted, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
