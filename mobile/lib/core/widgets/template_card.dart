import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Ported from the Primio-designed reference app's widgets/templates/template_card.dart,
/// decoupled from their InspectionTemplate model and stripped of the is3D branch -- 3D templates
/// are excluded from the picker for now, so this card only needs the standard-checklist look.
class TemplateCard extends StatelessWidget {
  final String name;
  final String subtitle;
  final VoidCallback onTap;

  const TemplateCard({
    super.key,
    required this.name,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(AppMetrics.spacingMd),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
          border: Border.all(color: AppColors.border, width: AppMetrics.borderDefault),
        ),
        child: Row(
          children: [
            Container(
              width: AppMetrics.avatarMd,
              height: AppMetrics.avatarMd,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    colors.primary.withValues(alpha: AppMetrics.opacityGlow),
                    colors.primary.withValues(alpha: AppMetrics.opacitySubtle),
                  ],
                  stops: const [0.0, 1.0],
                ),
                borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
              ),
              child: Icon(Icons.checklist_rounded, color: colors.primary, size: AppMetrics.iconMd),
            ),
            const SizedBox(width: AppMetrics.spacingSm + 4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: text.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: AppMetrics.spacingXs),
                  Text(subtitle, style: text.bodySmall),
                ],
              ),
            ),
            const SizedBox(width: AppMetrics.spacingSm),
            Icon(Icons.chevron_right, color: AppColors.muted, size: AppMetrics.iconMd),
          ],
        ),
      ),
    );
  }
}
