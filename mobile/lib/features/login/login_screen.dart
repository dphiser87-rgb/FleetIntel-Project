import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../l10n/app_localizations.dart';

/// Ported directly from the Fleet Hub reference app's login.tsx -- left-aligned wordmark, a plain
/// "Sign in" heading (no hero card), and form fields sitting directly on the background (no
/// FleetCard wrapper) with generous vertical gaps, not the earlier Primio-derived big-icon-hero +
/// card layout this screen used before. Real submit logic unchanged (authControllerProvider).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isSubmitting = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).login(
            _identifierController.text.trim(),
            _passwordController.text,
          );
    } catch (_) {
      if (mounted) setState(() => _error = l10n.loginError);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
          child: Padding(
            padding: const EdgeInsets.only(top: AppMetrics.spacingXl * 2, bottom: AppMetrics.spacingLg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Wordmark: left-aligned icon+name row, no hero card.
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: colors.primary,
                        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                      ),
                      child: Icon(Icons.local_shipping_rounded, color: colors.onPrimary, size: 22),
                    ),
                    const SizedBox(width: AppMetrics.spacingMd),
                    Text(l10n.appName, style: text.headlineSmall?.copyWith(letterSpacing: -0.5)),
                  ],
                ),
                const SizedBox(height: AppMetrics.spacingXl * 2),
                Text(l10n.loginTitle, style: text.displayLarge?.copyWith(fontSize: 30)),
                const SizedBox(height: AppMetrics.spacingSm),
                Text(
                  'Log a pre-trip inspection for your assigned vehicle.',
                  style: text.bodyMedium?.copyWith(color: AppColors.muted, height: 1.4),
                ),
                const SizedBox(height: AppMetrics.spacingXl),
                Text(l10n.loginIdentifierLabel, style: text.labelMedium),
                const SizedBox(height: AppMetrics.spacingSm),
                TextField(
                  controller: _identifierController,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  style: text.bodyMedium,
                ),
                const SizedBox(height: AppMetrics.spacingLg),
                Text(l10n.loginPasswordLabel, style: text.labelMedium),
                const SizedBox(height: AppMetrics.spacingSm),
                TextField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  style: text.bodyMedium,
                  onSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        color: AppColors.muted,
                        size: AppMetrics.iconMd,
                      ),
                      onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: AppMetrics.spacingSm),
                  Text(_error!, style: text.bodySmall?.copyWith(color: AppColors.danger)),
                ],
                const SizedBox(height: AppMetrics.spacingLg),
                FleetButton(label: l10n.loginButton, isLoading: _isSubmitting, onPressed: _submit),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
