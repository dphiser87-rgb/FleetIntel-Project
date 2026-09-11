import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/db/pending_sync_badge.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/hero_banner.dart';
import '../../l10n/app_localizations.dart';

enum _ReminderMode { done, overdue, due }

/// Visual layout ported from the Fleet Hub reference app's welcome.tsx: a shift-reminder banner
/// (done/due/overdue, computed from today's inspections + the workspace's admin-configured shift
/// cutoff hour) and a link into inspection history. Escalation config (cutoff hour, alert email) is
/// admin/manager-only on the web Settings page -- this screen only consumes the cutoff and reports
/// overdue, per the user's explicit decision that drivers shouldn't be able to set it themselves.
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
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.screenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: AppMetrics.spacingMd),
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  icon: const Icon(Icons.logout, color: AppColors.muted),
                  onPressed: () {
                    ref.read(authControllerProvider.notifier).logout();
                    context.go('/login');
                  },
                ),
              ),
              HeroBanner(
                eyebrow: 'Fleet Hub',
                title: l10n.welcomeMessage(name),
                subtitle: l10n.welcomeSubtitleDriver,
                icon: Icons.local_shipping_rounded,
              ),
              const SizedBox(height: AppMetrics.spacingLg),
              if (_loaded) _ReminderBanner(mode: _mode),
              const SizedBox(height: AppMetrics.spacingLg),
              const PendingSyncBadge(),
              const SizedBox(height: AppMetrics.spacingLg),
              FleetButton(
                label: 'Continue to inspection',
                icon: Icons.chevron_right,
                onPressed: () => context.go('/vehicle'),
              ),
              const SizedBox(height: AppMetrics.spacingMd),
              Center(
                child: GestureDetector(
                  onTap: () => context.push('/history'),
                  child: Text(
                    'View inspection history',
                    style: text.bodyMedium?.copyWith(color: colors.primary, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              const SizedBox(height: AppMetrics.spacingLg),
            ],
          ),
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
