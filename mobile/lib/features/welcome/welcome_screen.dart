import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../l10n/app_localizations.dart';

/// Personalized post-login landing: "Welcome, {name}" plus a role-appropriate line.
/// Only the driver copy is defined for Phase 0/1 -- other roles still use the web app.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final user = ref.watch(authControllerProvider).user;
    final name = (user?['name'] as String?)?.split(' ').first ?? '';

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(l10n.welcomeMessage(name), style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              Text(
                l10n.welcomeSubtitleDriver,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
                    ),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () => context.go('/vehicle'),
                child: const Text('Continue'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
