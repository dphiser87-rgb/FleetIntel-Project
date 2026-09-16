import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/db/pending_sync_badge.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../l10n/app_localizations.dart';
import '../workshop/workshop_ui.dart';

enum _ReminderMode { done, overdue, due }

/// The driver home screen -- a task-oriented UX pass on top of the Fleet Hub reference's
/// welcome.tsx layout: the screen leads with "ready to inspect" rather than a marketing headline,
/// the primary CTA is unambiguous, and "View inspection history" is visually subordinate to it.
/// Real state (auth, escalation/shift-reminder logic, sync status) unchanged.
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

  /// No draft/resume state is persisted for an in-progress inspection today -- answers live only
  /// in InspectionScreen's in-memory state and are discarded if the driver backs out -- so this
  /// always reports false for now. Kept as its own method (not inlined as a literal) so a future
  /// real draft-tracking feature has one obvious place to wire in, instead of a hard-coded string.
  bool _hasUnfinishedInspection() => false;

  void _openAccountSheet(Map<String, dynamic>? user) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surfaceElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppMetrics.radiusLarge)),
      ),
      builder: (context) => _AccountSheet(user: user),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final user = ref.watch(authControllerProvider).user;
    final name = (user?['name'] as String?)?.split(' ').first ?? '';
    final role = (user?['role'] as String?) ?? 'Driver';
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    // No draft/resume state is persisted for an in-progress inspection today (answers live only
    // in the InspectionScreen's in-memory state and are discarded if the driver backs out), so
    // this is always "Start" for now -- wired as a variable, not a hard-coded string, so a future
    // real draft-tracking feature only needs to flip this.
    final hasUnfinishedInspection = _hasUnfinishedInspection();
    final ctaLabel = hasUnfinishedInspection ? 'Continue inspection' : 'Start inspection';

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppMetrics.spacingLg,
                AppMetrics.spacingSm,
                AppMetrics.spacingSm,
                AppMetrics.spacingSm,
              ),
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
                  Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.settings_outlined, color: AppColors.muted),
                        tooltip: 'Account',
                        onPressed: () => _openAccountSheet(user),
                      ),
                      IconButton(
                        icon: const Icon(Icons.logout_outlined, color: AppColors.muted),
                        tooltip: 'Log out',
                        onPressed: () {
                          ref.read(authControllerProvider.notifier).logout();
                          context.go('/login');
                        },
                      ),
                    ],
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
                    // Hero: reduced height (was 190) so the task content below isn't pushed off
                    // the first screen -- the image supports the message, it doesn't lead it.
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
                          Semantics(
                            label: 'A driver reviewing a vehicle inspection on a tablet',
                            image: true,
                            child: Image.asset(
                              'assets/images/welcome_hero.png',
                              width: double.infinity,
                              height: 130,
                              fit: BoxFit.cover,
                              alignment: Alignment.topCenter,
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.all(AppMetrics.spacingMd),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('FLEETINTEL AFRICA · FLEET HUB',
                                    style: text.labelSmall?.copyWith(color: colors.primary, letterSpacing: 1.4, fontWeight: FontWeight.w800)),
                                const SizedBox(height: AppMetrics.spacingXs),
                                Text('Ready for your vehicle check?',
                                    style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                                const SizedBox(height: AppMetrics.spacingXs),
                                Text(
                                  'Complete your pre-trip inspection and report any issues before you drive.',
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
                          TextSpan(text: name, style: const TextStyle(fontWeight: FontWeight.w700)),
                          TextSpan(text: ' · ${roleDisplayName(role)}', style: const TextStyle(color: AppColors.muted)),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppMetrics.spacingMd),
                    if (_loaded) _ReminderBanner(mode: _mode),
                    // Alert -> primary action: ~24px, tight enough to read as one task block.
                    const SizedBox(height: AppMetrics.spacingLg),
                    SizedBox(
                      width: double.infinity,
                      child: FleetButton(
                        label: ctaLabel,
                        icon: Icons.arrow_forward_rounded,
                        iconAfter: true,
                        onPressed: () => context.go('/vehicle'),
                      ),
                    ),
                    // Primary action -> secondary link: ~16px, visually subordinate to the button above it.
                    const SizedBox(height: AppMetrics.spacingMd),
                    Center(
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                          onTap: () => context.push('/history'),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppMetrics.spacingMd,
                              vertical: AppMetrics.spacingSm + 4,
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.history, size: AppMetrics.iconSm, color: AppColors.muted),
                                const SizedBox(width: AppMetrics.spacingXs + 2),
                                Text(
                                  'View inspection history',
                                  style: text.labelLarge?.copyWith(color: AppColors.muted, fontWeight: FontWeight.w600),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppMetrics.spacingMd),
                    const PendingSyncBadge(),
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
          'Pre-trip inspection overdue',
          'Your inspection is overdue. Complete it before starting your trip.',
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

/// Read-only account info, reached via the header's settings icon. Deliberately not a real
/// settings/config screen: shift-cutoff hour and the overdue alert email are admin/manager-only,
/// set on the web Settings page -- a driver has nothing to configure here, only to see.
class _AccountSheet extends StatelessWidget {
  const _AccountSheet({required this.user});

  final Map<String, dynamic>? user;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final name = (user?['name'] as String?) ?? '—';
    final email = (user?['email'] as String?) ?? '—';
    final role = (user?['role'] as String?) ?? 'driver';

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppMetrics.spacingLg,
          AppMetrics.spacingLg,
          AppMetrics.spacingLg,
          AppMetrics.spacingXl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Account', style: text.headlineSmall),
            const SizedBox(height: AppMetrics.spacingLg),
            _AccountRow(label: 'Name', value: name),
            const SizedBox(height: AppMetrics.spacingMd),
            _AccountRow(label: 'Email', value: email),
            const SizedBox(height: AppMetrics.spacingMd),
            _AccountRow(label: 'Role', value: role),
            const SizedBox(height: AppMetrics.spacingLg),
            Container(height: 1, color: AppColors.border),
            const SizedBox(height: AppMetrics.spacingMd),
            Text('FleetIntel Africa · Fleet Hub', style: text.bodySmall?.copyWith(color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}

class _AccountRow extends StatelessWidget {
  const _AccountRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
        const SizedBox(height: 2),
        Text(value, style: text.bodyLarge?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
