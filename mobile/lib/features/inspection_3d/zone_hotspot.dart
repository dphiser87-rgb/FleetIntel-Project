import 'package:flutter/material.dart';
import 'check_result.dart';
import '../../core/theme/app_theme.dart';

class ZoneHotspot extends StatelessWidget {
  final CheckResult result;
  final VoidCallback onTap;

  const ZoneHotspot({super.key, required this.result, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    late final Color background;
    late final Color borderColor;
    late final Color iconColor;
    late final IconData icon;

    switch (result) {
      case CheckResult.pass:
        background = colors.primary;
        borderColor = colors.primary;
        iconColor = colors.onPrimary;
        icon = Icons.check_rounded;
        break;
      case CheckResult.fail:
        background = AppColors.danger;
        borderColor = AppColors.danger;
        iconColor = colors.onError;
        icon = Icons.priority_high_rounded;
        break;
      case CheckResult.warning:
        background = AppColors.warning;
        borderColor = AppColors.warning;
        iconColor = AppColors.background;
        icon = Icons.warning_amber_rounded;
        break;
      case CheckResult.na:
        background = AppColors.surfaceElevated;
        borderColor = AppColors.muted;
        iconColor = AppColors.muted;
        icon = Icons.remove_rounded;
        break;
      case CheckResult.none:
        background = AppColors.surfaceElevated;
        borderColor = colors.primary.withValues(alpha: AppMetrics.opacityStrong);
        iconColor = colors.primary;
        icon = Icons.add_rounded;
        break;
    }

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: AppMetrics.hotspotSize,
        height: AppMetrics.hotspotSize,
        decoration: BoxDecoration(
          color: background,
          shape: BoxShape.circle,
          border: Border.all(color: borderColor, width: AppMetrics.borderThick),
        ),
        child: Icon(icon, size: AppMetrics.iconSm, color: iconColor),
      ),
    );
  }
}
