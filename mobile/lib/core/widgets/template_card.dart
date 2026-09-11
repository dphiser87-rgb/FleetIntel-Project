import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Ported from the Fleet Hub reference app's templates.tsx TemplateCard -- a type tag
/// (CHECKLIST / VISUAL DIAGRAM), description, and an item/part-count + estimate footer row.
class TemplateCard extends StatelessWidget {
  final String name;
  final String description;
  final String meta; // e.g. "12 items · ~6 min" or "16 parts · ~8 min"
  final bool isVisual;
  final VoidCallback onTap;

  const TemplateCard({
    super.key,
    required this.name,
    required this.description,
    required this.meta,
    required this.onTap,
    this.isVisual = false,
  });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(AppMetrics.spacingLg),
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
          border: Border.all(color: AppColors.border, width: AppMetrics.borderDefault),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  width: AppMetrics.avatarMd - 4,
                  height: AppMetrics.avatarMd - 4,
                  decoration: BoxDecoration(
                    color: isVisual ? colors.primary.withValues(alpha: AppMetrics.opacitySubtle) : AppColors.surface,
                    borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                  ),
                  child: Icon(
                    isVisual ? Icons.grid_view_rounded : Icons.checklist_rounded,
                    color: isVisual ? colors.primary : AppColors.ink,
                    size: AppMetrics.iconMd,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingSm, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    border: Border.all(color: AppColors.border),
                    borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                  ),
                  child: Text(
                    isVisual ? 'VISUAL DIAGRAM' : 'CHECKLIST',
                    style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppMetrics.spacingSm + 4),
            Text(name, style: text.titleLarge),
            if (description.isNotEmpty) ...[
              const SizedBox(height: AppMetrics.spacingXs),
              Text(description, style: text.bodySmall?.copyWith(color: AppColors.muted)),
            ],
            const SizedBox(height: AppMetrics.spacingSm),
            Container(
              padding: const EdgeInsets.only(top: AppMetrics.spacingSm),
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(meta, style: text.bodySmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w600)),
                  Icon(Icons.chevron_right, color: colors.primary, size: AppMetrics.iconMd),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
