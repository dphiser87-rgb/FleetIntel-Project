import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Feature/action row: icon badge + title/subtitle + action chip.
/// Mirrors a polished "explore features" list pattern within the
/// dark minimal single-accent design system.
class FeatureRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String actionLabel;
  final VoidCallback onTap;

  const FeatureRow({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.actionLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingSm + 4),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: AppMetrics.opacitySubtle),
                  borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                ),
                child: Icon(icon, color: colors.primary, size: AppMetrics.iconMd),
              ),
              const SizedBox(width: AppMetrics.spacingSm + 4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: text.titleMedium),
                    const SizedBox(height: AppMetrics.spacingXs),
                    Text(
                      subtitle,
                      style: text.bodySmall?.copyWith(color: AppColors.muted),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppMetrics.spacingSm),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppMetrics.spacingSm + 4,
                  vertical: AppMetrics.spacingSm,
                ),
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: AppMetrics.opacitySubtle),
                  borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                  border: Border.all(color: colors.primary),
                ),
                child: Text(
                  actionLabel,
                  style: text.labelMedium?.copyWith(
                    color: colors.primary,
                    fontWeight: FontWeight.w600,
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
