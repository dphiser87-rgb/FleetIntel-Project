import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';

const int _kOtpLength = 6;
const int _kResendCooldownSeconds = 60;

/// Second step of driver login -- collects the 6-digit code /auth/login emailed after password
/// verification. Pushed (not a go_router route) since it's a linear continuation of the login
/// flow, not something that needs to be deep-linkable on its own.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.identifier, required this.password, required this.email});

  /// Whatever the driver typed on the login screen (email or phone) -- /auth/login resolves it,
  /// same as the original login call.
  final String identifier;
  final String password;
  final String email;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _codeController = TextEditingController();
  final _codeFocus = FocusNode();
  bool _isSubmitting = false;
  bool _isResending = false;
  String? _error;
  int _resendSecondsLeft = _kResendCooldownSeconds;
  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();
    _startResendCooldown();
  }

  @override
  void dispose() {
    _codeController.dispose();
    _codeFocus.dispose();
    _resendTimer?.cancel();
    super.dispose();
  }

  void _startResendCooldown() {
    _resendTimer?.cancel();
    setState(() => _resendSecondsLeft = _kResendCooldownSeconds);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_resendSecondsLeft <= 1) {
        timer.cancel();
        setState(() => _resendSecondsLeft = 0);
      } else {
        setState(() => _resendSecondsLeft -= 1);
      }
    });
  }

  String? _errorDetail(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data['detail'] is String) return data['detail'] as String;
    }
    return null;
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;
    final code = _codeController.text.trim();
    if (code.length != _kOtpLength) return;
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).verifyOtp(widget.identifier, widget.password, code);
      // AuthController now holds an authenticated state -- the router (see app_router.dart's
      // redirect on authControllerProvider) takes it from here, same as a normal password login.
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = _errorDetail(e) ?? 'Invalid code';
          _codeController.clear();
        });
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _resend() async {
    if (_isResending || _resendSecondsLeft > 0) return;
    setState(() {
      _isResending = true;
      _error = null;
    });
    try {
      // A fresh no-code /auth/login call is the resend trigger -- it always throws
      // Requires2FAException again (still no code), which is exactly what we want here.
      await ref.read(authControllerProvider.notifier).login(widget.identifier, widget.password);
    } on Requires2FAException {
      // expected
    } catch (e) {
      if (mounted) setState(() => _error = _errorDetail(e) ?? 'Could not resend code');
    } finally {
      if (mounted) {
        setState(() => _isResending = false);
        _startResendCooldown();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    final fieldBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: AppColors.border),
    );

    return Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent, elevation: 0),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Enter your code', style: text.displayLarge?.copyWith(fontSize: 30)),
              const SizedBox(height: AppMetrics.spacingSm),
              Text.rich(
                TextSpan(
                  style: text.bodyMedium?.copyWith(color: AppColors.muted, height: 1.4),
                  children: [
                    const TextSpan(text: 'We emailed a 6-digit code to '),
                    TextSpan(text: widget.email, style: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w600)),
                    const TextSpan(text: '.'),
                  ],
                ),
              ),
              const SizedBox(height: AppMetrics.spacingXl),
              Semantics(
                textField: true,
                label: 'Sign-in code',
                child: TextField(
                  controller: _codeController,
                  focusNode: _codeFocus,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  maxLength: _kOtpLength,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  style: text.headlineMedium?.copyWith(letterSpacing: 12, fontFeatures: const [FontFeature.tabularFigures()]),
                  textAlign: TextAlign.center,
                  onChanged: (value) {
                    if (_error != null) setState(() => _error = null);
                    if (value.length == _kOtpLength) _submit();
                  },
                  onSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    counterText: '',
                    filled: true,
                    fillColor: AppColors.surface,
                    hintText: '000000',
                    hintStyle: text.headlineMedium?.copyWith(letterSpacing: 12, color: AppColors.border),
                    contentPadding: const EdgeInsets.symmetric(vertical: 18),
                    border: fieldBorder,
                    enabledBorder: fieldBorder,
                    focusedBorder: fieldBorder.copyWith(borderSide: BorderSide(color: colors.primary, width: 1.5)),
                    errorBorder: fieldBorder.copyWith(borderSide: const BorderSide(color: AppColors.danger)),
                    errorText: _error,
                    errorStyle: text.bodySmall?.copyWith(color: AppColors.danger),
                  ),
                ),
              ),
              const SizedBox(height: AppMetrics.spacingXl),
              SizedBox(
                width: double.infinity,
                child: FleetButton(label: 'Verify', isLoading: _isSubmitting, onPressed: _submit, borderRadius: 8),
              ),
              const SizedBox(height: AppMetrics.spacingLg),
              Center(
                child: _isResending
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : TextButton(
                        onPressed: _resendSecondsLeft > 0 ? null : _resend,
                        child: Text(
                          _resendSecondsLeft > 0 ? 'Resend code in ${_resendSecondsLeft}s' : 'Resend code',
                          style: text.bodySmall?.copyWith(
                            color: _resendSecondsLeft > 0 ? AppColors.muted : colors.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
