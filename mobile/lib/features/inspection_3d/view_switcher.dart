import 'package:flutter/material.dart';
import 'zone.dart';
import '../../core/theme/app_theme.dart';

class ViewSwitcher extends StatelessWidget {
  final ZoneView active;
  final ValueChanged<ZoneView> onChanged;

  const ViewSwitcher({super.key, required this.active, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(AppMetrics.spacingXs),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: ZoneView.values.map((view) {
          final selected = view == active;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(view),
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                padding: const EdgeInsets.symmetric(
                  vertical: AppMetrics.spacingSm + 2,
                ),
                decoration: BoxDecoration(
                  color: selected
                      ? colors.primary.withValues(alpha: AppMetrics.opacitySubtle)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                  border: Border.all(
                    color: selected ? colors.primary : Colors.transparent,
                  ),
                ),
                child: Text(
                  view.label,
                  textAlign: TextAlign.center,
                  style: text.labelMedium?.copyWith(
                    color: selected ? colors.primary : AppColors.muted,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
