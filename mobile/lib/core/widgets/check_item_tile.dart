import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';

/// Ported from the Primio-designed reference app's widgets/inspection/check_item_tile.dart,
/// decoupled from their ChecklistItem/CheckResult model classes -- our real InspectionScreen uses
/// a flat "pass"/"fail" string value (see inspection_screen.dart's _Answer), not a typed enum, so
/// this takes plain strings instead.
class CheckItemTile extends StatelessWidget {
  final String label;
  final String? selectedValue; // 'pass' | 'fail' | 'na' | null
  final ValueChanged<String> onResultChanged;

  const CheckItemTile({
    super.key,
    required this.label,
    required this.selectedValue,
    required this.onResultChanged,
  });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppMetrics.spacingMd,
        vertical: AppMetrics.spacingSm + 4,
      ),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: text.bodyMedium),
          const SizedBox(height: AppMetrics.spacingSm + 2),
          Row(
            children: [
              _ResultChip(
                label: 'Pass',
                icon: Icons.check,
                isSelected: selectedValue == 'pass',
                color: colors.primary,
                onTap: () {
                  HapticFeedback.lightImpact();
                  onResultChanged('pass');
                },
              ),
              const SizedBox(width: AppMetrics.spacingSm),
              _ResultChip(
                label: 'Fail',
                icon: Icons.close,
                isSelected: selectedValue == 'fail',
                color: AppColors.danger,
                onTap: () {
                  HapticFeedback.lightImpact();
                  onResultChanged('fail');
                },
              ),
              const SizedBox(width: AppMetrics.spacingSm),
              _ResultChip(
                label: 'N/A',
                icon: Icons.remove,
                isSelected: selectedValue == 'na',
                color: AppColors.muted,
                onTap: () {
                  HapticFeedback.lightImpact();
                  onResultChanged('na');
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ResultChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isSelected;
  final Color color;
  final VoidCallback onTap;

  const _ResultChip({
    required this.label,
    required this.icon,
    required this.isSelected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(
          horizontal: AppMetrics.spacingSm + 4,
          vertical: AppMetrics.spacingSm,
        ),
        decoration: BoxDecoration(
          color: isSelected ? color.withValues(alpha: 0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
          border: Border.all(
            color: isSelected ? color : AppColors.border,
            width: isSelected ? AppMetrics.borderThick : AppMetrics.borderDefault,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: AppMetrics.iconSm, color: isSelected ? color : AppColors.muted),
            const SizedBox(width: AppMetrics.spacingXs),
            Text(
              label,
              style: text.labelMedium?.copyWith(
                color: isSelected ? color : AppColors.muted,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
