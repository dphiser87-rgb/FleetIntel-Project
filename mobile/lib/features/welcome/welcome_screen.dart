import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/db/pending_sync_badge.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/feature_row.dart';
import '../../core/widgets/fleet_card.dart';
import '../../core/widgets/hero_banner.dart';
import '../../l10n/app_localizations.dart';

/// Visual layout ported from the Primio-designed reference app's welcome_screen.dart -- real user
/// data and navigation unchanged (authControllerProvider, go_router).
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final user = ref.watch(authControllerProvider).user;
    final name = (user?['name'] as String?)?.split(' ').first ?? '';
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.screenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: AppMetrics.spacingLg),
              HeroBanner(
                eyebrow: 'Fleet Hub',
                title: l10n.welcomeMessage(name),
                subtitle: l10n.welcomeSubtitleDriver,
                icon: Icons.local_shipping_rounded,
              ),
              const SizedBox(height: AppMetrics.spacingLg),
              Text('TODAY', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
              const SizedBox(height: AppMetrics.spacingSm),
              FleetCard(
                child: Column(
                  children: [
                    FeatureRow(
                      icon: Icons.fact_check_outlined,
                      title: 'Pre-trip inspection',
                      subtitle: 'Confirm your vehicle and complete the checklist',
                      actionLabel: 'Start',
                      onTap: () => context.go('/vehicle'),
                    ),
                    Divider(color: AppColors.border, height: AppMetrics.borderDefault),
                    FeatureRow(
                      icon: Icons.info_outline_rounded,
                      title: 'Before you depart',
                      subtitle: 'Log the odometer and flag any defects you find',
                      actionLabel: 'Info',
                      onTap: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              'Complete every checklist item before submitting.',
                              style: text.bodySmall?.copyWith(color: AppColors.ink),
                            ),
                            backgroundColor: AppColors.surfaceElevated,
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppMetrics.spacingLg),
              const PendingSyncBadge(),
              const SizedBox(height: AppMetrics.spacingXl),
              Center(
                child: TextButton(
                  onPressed: () {
                    ref.read(authControllerProvider.notifier).logout();
                    context.go('/login');
                  },
                  child: Text('Sign out', style: text.labelMedium?.copyWith(color: AppColors.muted)),
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
