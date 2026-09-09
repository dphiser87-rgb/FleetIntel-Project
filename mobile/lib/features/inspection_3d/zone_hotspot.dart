import 'package:flutter/material.dart';
import 'check_result.dart';
import '../../core/theme/app_theme.dart';

/// A filled, glowing dot -- no ring, no icon glyph. Matches Primio's reference art
/// (assets/images/preview_3d_*.jpg in their repo), which turned out to be a hand-designed
/// preview rather than a literal screenshot of their shipped ring+icon marker widget.
class ZoneHotspot extends StatelessWidget {
  final CheckResult result;
  final VoidCallback onTap;

  const ZoneHotspot({super.key, required this.result, required this.onTap});

  @override
  Widget build(BuildContext context) {
    late final Color color;

    switch (result) {
      case CheckResult.pass:
        color = AppColors.primary;
        break;
      case CheckResult.fail:
        color = AppColors.danger;
        break;
      case CheckResult.warning:
        color = AppColors.warning;
        break;
      case CheckResult.na:
        color = AppColors.muted;
        break;
      case CheckResult.none:
        color = AppColors.muted;
        break;
    }

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: AppMetrics.hotspotSize * 0.62,
        height: AppMetrics.hotspotSize * 0.62,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(color: color.withValues(alpha: 0.65), blurRadius: 10, spreadRadius: 1),
          ],
        ),
      ),
    );
  }
}
