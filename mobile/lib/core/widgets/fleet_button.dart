import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class FleetButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isOutlined;
  final IconData? icon;
  /// Puts [icon] after the label (e.g. a trailing arrow) instead of before it, with a tighter
  /// gap so the icon reads as part of the label rather than a separate, floating element.
  final bool iconAfter;
  /// Overrides the app-wide sharp (2px) button corner radius for screens -- like login -- that
  /// intentionally pair a softer radius on this button with the same radius on their input
  /// fields. Leave null to keep the default theme shape everywhere else.
  final double? borderRadius;

  const FleetButton({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.isOutlined = false,
    this.icon,
    this.iconAfter = false,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final child = isLoading
        ? SizedBox(
            height: AppMetrics.iconMd,
            width: AppMetrics.iconMd,
            child: CircularProgressIndicator(
              strokeWidth: AppMetrics.borderThick,
              color: isOutlined
                  ? Theme.of(context).colorScheme.primary
                  : Theme.of(context).colorScheme.onPrimary,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null && !iconAfter) ...[
                Icon(icon, size: AppMetrics.iconSm + 2),
                const SizedBox(width: AppMetrics.spacingSm),
              ],
              Text(label),
              if (icon != null && iconAfter) ...[
                const SizedBox(width: AppMetrics.spacingXs + 2),
                Icon(icon, size: AppMetrics.iconSm + 2),
              ],
            ],
          );

    final shape = borderRadius == null
        ? null
        : RoundedRectangleBorder(borderRadius: BorderRadius.circular(borderRadius!));

    final button = isOutlined
        ? OutlinedButton(
            style: shape == null ? null : OutlinedButton.styleFrom(shape: shape),
            onPressed: isLoading ? null : onPressed,
            child: child,
          )
        : ElevatedButton(
            style: shape == null ? null : ElevatedButton.styleFrom(shape: shape),
            onPressed: isLoading ? null : onPressed,
            child: child,
          );

    // Material buttons already meet the 48dp minimum touch target via the theme's button
    // padding, but constrain explicitly so this holds regardless of text-scale/theme changes.
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 48),
      child: button,
    );
  }
}
