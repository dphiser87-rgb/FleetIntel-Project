import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../l10n/app_localizations.dart';
import 'otp_screen.dart';

/// FleetHub's login screen -- left-aligned wordmark, a plain "Log in" heading (no hero card), and
/// form fields sitting directly on the background with generous vertical gaps. Refined per a
/// UX pass targeting input/button sizing, icons, focus/error states, a real (backend-backed)
/// "Forgot password?" entry point, and a subtle footer -- real submit logic unchanged
/// (authControllerProvider.notifier.login).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _isSubmitting = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isSubmitting) return; // guards against a double-tap firing two logins at once
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    final identifier = _identifierController.text.trim();
    final password = _passwordController.text;
    try {
      await ref.read(authControllerProvider.notifier).login(identifier, password);
    } on Requires2FAException catch (e) {
      if (mounted) {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => OtpScreen(identifier: identifier, password: password, email: e.email),
          ),
        );
      }
    } catch (_) {
      if (mounted) setState(() => _error = l10n.loginError);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _openForgotPassword() async {
    final prefill = _identifierController.text.trim().contains('@') ? _identifierController.text.trim() : '';
    await showDialog<void>(
      context: context,
      builder: (context) => _ForgotPasswordDialog(prefillEmail: prefill),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    final fieldBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: AppColors.border),
    );

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
                child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: AppMetrics.spacingXl + AppMetrics.spacingSm),
                // Wordmark: left-aligned icon+name row, no hero card.
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: colors.primary,
                        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                      ),
                      child: Icon(Icons.local_shipping_rounded, color: colors.onPrimary, size: 24),
                    ),
                    const SizedBox(width: AppMetrics.spacingMd),
                    Text(l10n.appName, style: text.headlineSmall?.copyWith(letterSpacing: -0.5, height: 1.0)),
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
                Semantics(
                  textField: true,
                  label: l10n.loginIdentifierLabel,
                  child: TextField(
                    controller: _identifierController,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    textCapitalization: TextCapitalization.none,
                    autocorrect: false,
                    style: text.bodyMedium,
                    onChanged: (_) {
                      if (_error != null) setState(() => _error = null);
                    },
                    onSubmitted: (_) => _passwordFocus.requestFocus(),
                    decoration: InputDecoration(
                      hintText: 'Email or phone number',
                      filled: true,
                      fillColor: AppColors.surface,
                      contentPadding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: 16),
                      prefixIcon: const Icon(Icons.person_outline, color: AppColors.muted, size: AppMetrics.iconMd),
                      border: fieldBorder,
                      enabledBorder: fieldBorder,
                      focusedBorder: fieldBorder.copyWith(borderSide: BorderSide(color: colors.primary, width: 1.5)),
                      errorBorder: fieldBorder.copyWith(borderSide: const BorderSide(color: AppColors.danger)),
                    ),
                  ),
                ),
                const SizedBox(height: AppMetrics.spacingLg),
                Text(l10n.loginPasswordLabel, style: text.labelMedium),
                const SizedBox(height: AppMetrics.spacingSm),
                Semantics(
                  textField: true,
                  label: l10n.loginPasswordLabel,
                  child: TextField(
                    controller: _passwordController,
                    focusNode: _passwordFocus,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.done,
                    style: text.bodyMedium,
                    onChanged: (_) {
                      if (_error != null) setState(() => _error = null);
                    },
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      hintText: 'Your password',
                      filled: true,
                      fillColor: AppColors.surface,
                      contentPadding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: 16),
                      prefixIcon: const Icon(Icons.lock_outline, color: AppColors.muted, size: AppMetrics.iconMd),
                      border: fieldBorder,
                      enabledBorder: fieldBorder,
                      focusedBorder: fieldBorder.copyWith(borderSide: BorderSide(color: colors.primary, width: 1.5)),
                      errorBorder: fieldBorder.copyWith(borderSide: const BorderSide(color: AppColors.danger)),
                      errorText: _error,
                      suffixIcon: Semantics(
                        button: true,
                        label: _obscurePassword ? 'Show password' : 'Hide password',
                        child: IconButton(
                          icon: Icon(
                            _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                            color: AppColors.muted,
                            size: AppMetrics.iconMd,
                          ),
                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppMetrics.spacingSm),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    style: ButtonStyle(
                      // Grey by default, FleetIntel green only while actively pressed -- keeps the
                      // link visually secondary until the driver is interacting with it.
                      foregroundColor: WidgetStateProperty.resolveWith(
                        (states) => states.contains(WidgetState.pressed) ? colors.primary : AppColors.muted,
                      ),
                      minimumSize: const WidgetStatePropertyAll(Size(44, 44)),
                      padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: AppMetrics.spacingSm)),
                    ),
                    onPressed: _openForgotPassword,
                    // No explicit color here -- leaving it unset lets the button's own
                    // foregroundColor (grey by default, green while pressed) show through.
                    child: Text('Forgot password?', style: text.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(height: AppMetrics.spacingMd),
                SizedBox(
                  width: double.infinity,
                  child: FleetButton(
                    label: l10n.loginButton,
                    isLoading: _isSubmitting,
                    onPressed: _submit,
                    borderRadius: 8,
                  ),
                ),
                const SizedBox(height: AppMetrics.spacingXl),
              ],
                ),
              ),
            ),
            // Fixed footer -- pinned below the scrollable content (not fighting it for space via
            // a Spacer, which can't resolve inside a scroll view's unbounded height) so it reads
            // as "near the bottom" per the design brief while the keyboard can still push the
            // scrollable content up above it without layout errors.
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingMd),
              child: Center(
                child: Column(
                  children: [
                    Text(l10n.appName, style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 0.6)),
                    const SizedBox(height: AppMetrics.spacingXs),
                    Text(
                      'Need help? Contact your fleet administrator',
                      style: text.labelSmall?.copyWith(color: AppColors.muted),
                    ),
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

/// Real (backend-backed) forgot-password entry point: POST /auth/forgot-password already exists
/// and is deliberately anti-enumeration (identical response whether or not the email exists), so
/// this dialog always shows the same "if an account exists" confirmation regardless of outcome.
class _ForgotPasswordDialog extends ConsumerStatefulWidget {
  const _ForgotPasswordDialog({required this.prefillEmail});

  final String prefillEmail;

  @override
  ConsumerState<_ForgotPasswordDialog> createState() => _ForgotPasswordDialogState();
}

class _ForgotPasswordDialogState extends ConsumerState<_ForgotPasswordDialog> {
  late final _emailController = TextEditingController(text: widget.prefillEmail);
  bool _submitting = false;
  bool _sent = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final email = _emailController.text.trim();
    if (!email.contains('@')) return;
    setState(() => _submitting = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      await dio.post('/auth/forgot-password', data: {'email': email});
    } catch (_) {
      // Deliberately ignored: the backend already returns {"ok": true} regardless of whether the
      // email exists, so a network hiccup here is the only realistic failure -- still show the
      // same confirmation rather than leaking anything about account existence.
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
    if (mounted) setState(() => _sent = true);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    return AlertDialog(
      backgroundColor: AppColors.surfaceElevated,
      title: Text(_sent ? 'Check your email' : 'Reset your password', style: text.titleLarge),
      content: _sent
          ? Text(
              "If an account exists for that email, we've sent a link to reset your password.",
              style: text.bodyMedium?.copyWith(color: AppColors.muted),
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Enter the email on your account and we'll send you a reset link.",
                  style: text.bodyMedium?.copyWith(color: AppColors.muted),
                ),
                const SizedBox(height: AppMetrics.spacingMd),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  autofocus: true,
                  decoration: const InputDecoration(hintText: 'driver@fleethub.africa'),
                ),
              ],
            ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(_sent ? 'Done' : 'Cancel', style: TextStyle(color: colors.primary)),
        ),
        if (!_sent)
          FleetButton(label: 'Send link', isLoading: _submitting, onPressed: _send),
      ],
    );
  }
}
