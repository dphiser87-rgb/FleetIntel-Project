import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/fleet_card.dart';
import '../../l10n/app_localizations.dart';

/// Visual layout ported from the Primio-designed reference app's login_screen.dart -- real submit
/// logic unchanged from before (authControllerProvider.notifier.login).
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
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.screenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: AppMetrics.spacingXl * 2),
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [colors.primary, colors.primary.withValues(alpha: AppMetrics.opacityOverlay)],
                        ),
                        borderRadius: BorderRadius.circular(AppMetrics.radiusLarge),
                      ),
                      child: Icon(Icons.local_shipping_rounded, color: colors.onPrimary, size: AppMetrics.iconLg),
                    ),
                    const SizedBox(height: AppMetrics.spacingMd),
                    Text(l10n.appName, style: text.headlineMedium),
                    const SizedBox(height: AppMetrics.spacingXs),
                    Text(
                      'FleetIntel Africa',
                      style: text.bodySmall?.copyWith(color: colors.primary, fontWeight: FontWeight.w600, letterSpacing: 0.6),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppMetrics.spacingXl * 2),
              FleetCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l10n.loginTitle, style: text.headlineLarge),
                    const SizedBox(height: AppMetrics.spacingSm),
                    Text('Enter your credentials to continue', style: text.bodyMedium?.copyWith(color: AppColors.muted)),
                    const SizedBox(height: AppMetrics.spacingLg),
                    Text(l10n.loginIdentifierLabel, style: text.labelMedium),
                    const SizedBox(height: AppMetrics.spacingSm),
                    TextField(
                      controller: _identifierController,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: AppMetrics.spacingMd),
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
            ],
          ),
        ),
      ),
    );
  }
}
