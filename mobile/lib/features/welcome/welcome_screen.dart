import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/db/pending_sync_badge.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../l10n/app_localizations.dart';

enum _ReminderMode { done, overdue, due }

/// Ported directly from the Fleet Hub reference app's welcome.tsx: a top row with the small
/// wordmark + logout icon (not the earlier Primio-derived big HeroBanner gradient card), then a
/// typographic greeting -- "WELCOME BACK" eyebrow, a big "Hello, {name}." headline, role, and copy
/// -- followed by the shift-reminder banner. The reference's own hero treatment there is a real
/// photo image we don't have an asset for, so this goes straight to that typographic block, which
/// is the reference's actual fallback-capable content, not an invented substitute.
class WelcomeScreen extends ConsumerStatefulWidget {
  const WelcomeScreen({super.key});

  @override
  ConsumerState<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends ConsumerState<WelcomeScreen> {
  _ReminderMode _mode = _ReminderMode.due;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _loadReminderState();
  }

  Future<void> _loadReminderState() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([
        dio.get('/inspections'),
        dio.get('/workspace/shift-settings'),
      ]);
      final inspections = (results[0].data as List).map((e) => Map<String, dynamic>.from(e)).toList();
      final cutoffHour = (results[1].data['shift_start_hour'] as num?)?.toInt() ?? 9;

      final now = DateTime.now();
      final doneToday = inspections.any((i) {
        final createdAt = i['created_at'];
        if (createdAt == null) return false;
        final d = DateTime.tryParse(createdAt as String)?.toLocal();
        return d != null && d.year == now.year && d.month == now.month && d.day == now.day;
      });

      if (doneToday) {
        if (mounted) {
          setState(() {
            _mode = _ReminderMode.done;
            _loaded = true;
          });
        }
        return;
      }

      final isOverdue = now.hour >= cutoffHour;
      if (!isOverdue) {
        if (mounted) {
          setState(() {
            _mode = _ReminderMode.due;
            _loaded = true;
          });
        }
        return;
      }

      final escalationResponse = await dio.get('/escalations/today');
      final alreadyFlagged = escalationResponse.data['flagged'] == true;
      if (!alreadyFlagged) {
        await dio.post('/escalations', data: {'reason': 'Start-of-shift inspection overdue'});
      }
      if (mounted) {
        setState(() {
          _mode = _ReminderMode.overdue;
          _loaded = true;
        });
      }
    } catch (_) {
      // Best-effort: the reminder banner is informational, never a blocker for the real flow.
      if (mounted) setState(() => _loaded = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final user = ref.watch(authControllerProvider).user;
    final name = (user?['name'] as String?)?.split(' ').first ?? '';
    final role = (user?['role'] as String?) ?? 'Driver';
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg, vertical: AppMetrics.spacingSm),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: colors.primary,
                          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                        ),
                        child: Icon(Icons.local_shipping_rounded, color: colors.onPrimary, size: 16),
                      ),
                      const SizedBox(width: AppMetrics.spacingSm),
                      Text(l10n.appName, style: text.titleSmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w800)),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.logout, color: AppColors.muted),
                    onPressed: () {
                      ref.read(authControllerProvider.notifier).logout();
                      context.go('/login');
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
                    Container(
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Image.asset('assets/images/welcome_hero.png', width: double.infinity, height: 190, fit: BoxFit.cover),
                          Padding(
                            padding: const EdgeInsets.all(AppMetrics.spacingMd),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('FLEETINTEL AFRICA',
                                    style: text.labelSmall?.copyWith(color: colors.primary, letterSpacing: 2, fontWeight: FontWeight.w800)),
                                const SizedBox(height: AppMetrics.spacingXs),
                                Text('More than a checklist.',
                                    style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.4)),
                                const SizedBox(height: AppMetrics.spacingXs),
                                Text(
                                  'Intelligent fleet costing, vehicle health checks and compliance — working together in one app.',
                                  style: text.bodySmall?.copyWith(color: AppColors.muted, height: 1.4),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppMetrics.spacingLg),
                    Text('WELCOME BACK',
                        style: text.labelMedium?.copyWith(color: colors.primary, letterSpacing: 2, fontWeight: FontWeight.w800)),
                    const SizedBox(height: AppMetrics.spacingSm),
                    Text(
                      'Hello,\n$name.',
                      style: text.displayLarge?.copyWith(fontSize: 36, height: 1.1),
                    ),
                    const SizedBox(height: AppMetrics.spacingXs),
                    Text(role, style: text.titleMedium?.copyWith(color: AppColors.muted, fontWeight: FontWeight.w700)),
                    const SizedBox(height: AppMetrics.spacingMd),
                    Text(
                      "Let's run today's pre-trip inspection. It takes a few minutes and keeps your vehicle compliant and safe.",
                      style: text.bodyMedium?.copyWith(color: AppColors.ink, height: 1.5),
                    ),
                    const SizedBox(height: AppMetrics.spacingLg),
                    if (_loaded) _ReminderBanner(mode: _mode),
                    const SizedBox(height: AppMetrics.spacingLg),
                    const PendingSyncBadge(),
                    const SizedBox(height: AppMetrics.spacingLg),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppMetrics.spacingLg,
                0,
                AppMetrics.spacingLg,
                AppMetrics.spacingLg,
              ),
              child: Column(
                children: [
                  FleetButton(
                    label: 'Continue to inspection',
                    icon: Icons.chevron_right,
                    onPressed: () => context.go('/vehicle'),
                  ),
                  const SizedBox(height: AppMetrics.spacingMd),
                  GestureDetector(
                    onTap: () => context.push('/history'),
                    child: Text(
                      'View inspection history',
                      style: text.bodyMedium?.copyWith(color: colors.primary, fontWeight: FontWeight.w700),
                    ),
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

class _ReminderBanner extends StatelessWidget {
  const _ReminderBanner({required this.mode});

  final _ReminderMode mode;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    final (Color borderColor, Color bg, IconData icon, Color iconColor, String title, String copy) = switch (mode) {
      _ReminderMode.done => (
          colors.primary,
          colors.primary.withValues(alpha: AppMetrics.opacitySubtle),
          Icons.check_circle_outline,
          colors.primary,
          "Today's pre-trip check is done",
          "You're cleared for the road. Run another anytime.",
        ),
      _ReminderMode.overdue => (
          AppColors.danger,
          AppColors.danger.withValues(alpha: AppMetrics.opacitySubtle),
          Icons.warning_amber_rounded,
          AppColors.danger,
          'Pre-trip check overdue',
          'Your depot has been notified. Complete it now to clear the flag.',
        ),
      _ReminderMode.due => (
          AppColors.warning,
          AppColors.surfaceElevated,
          Icons.warning_amber_rounded,
          AppColors.warning,
          'Start-of-shift check due',
          "You haven't logged an inspection today. Complete it before you drive.",
        ),
    };

    return Container(
      padding: const EdgeInsets.all(AppMetrics.spacingMd),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: iconColor),
          const SizedBox(width: AppMetrics.spacingMd),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: text.titleSmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(copy, style: text.bodySmall?.copyWith(color: AppColors.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
