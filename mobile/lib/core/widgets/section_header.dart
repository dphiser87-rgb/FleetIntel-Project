import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Ported from the Primio-designed reference app's widgets/inspection/section_header.dart,
/// decoupled from their InspectionSection model -- takes plain values so it works against our
/// real template['sections'] map shape.
class InspectionSectionHeader extends StatelessWidget {
  final String name;
  final int sectionIndex;
  final int completed;
  final int total;

  const InspectionSectionHeader({
    super.key,
    required this.name,
    required this.sectionIndex,
    required this.completed,
    required this.total,
  });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final allDone = total > 0 && completed == total;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppMetrics.spacingMd,
        vertical: AppMetrics.spacingSm + 4,
      ),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: allDone
                  ? colors.primary.withValues(alpha: 0.15)
                  : AppColors.border.withValues(alpha: AppMetrics.opacityHint),
              borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
            ),
            child: Center(
              child: allDone
                  ? Icon(Icons.check, color: colors.primary, size: AppMetrics.iconSm)
                  : Text(
                      '${sectionIndex + 1}',
                      style: text.labelSmall?.copyWith(
                        color: AppColors.muted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
          const SizedBox(width: AppMetrics.spacingSm + 4),
          Expanded(
            child: Text(
              name,
              style: text.titleSmall?.copyWith(
                color: AppColors.ink,
                letterSpacing: 0.5,
                fontSize: 13,
              ),
            ),
          ),
          Text(
            '$completed/$total',
            style: text.labelSmall?.copyWith(
              color: allDone ? colors.primary : AppColors.muted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
