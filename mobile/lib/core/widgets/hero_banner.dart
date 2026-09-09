import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Gradient hero card used at the top of key screens for a polished,
/// high-impact first impression while staying within the dark minimal
/// single-accent design system.
class HeroBanner extends StatelessWidget {
  final String eyebrow;
  final String title;
  final String? subtitle;
  final IconData icon;
  final Widget? trailing;

  const HeroBanner({
    super.key,
    required this.eyebrow,
    required this.title,
    this.subtitle,
    required this.icon,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppMetrics.radiusLarge),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppMetrics.spacingLg),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              colors.primary.withValues(alpha: AppMetrics.opacityGlow),
              AppColors.surface,
            ],
          ),
          border: Border.all(color: AppColors.border),
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              right: -AppMetrics.spacingLg,
              top: -AppMetrics.spacingLg,
              child: Icon(
                icon,
                size: AppMetrics.iconLg * 3,
                color: colors.primary.withValues(alpha: AppMetrics.opacitySubtle),
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        eyebrow.toUpperCase(),
                        style: text.labelSmall?.copyWith(
                          color: colors.primary,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.2,
                        ),
                      ),
                    ),
                    if (trailing != null) trailing!,
                  ],
                ),
                const SizedBox(height: AppMetrics.spacingSm),
                Text(title, style: text.headlineMedium),
                if (subtitle != null) ...[
                  const SizedBox(height: AppMetrics.spacingXs),
                  Text(
                    subtitle!,
                    style: text.bodyMedium?.copyWith(color: AppColors.muted),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
