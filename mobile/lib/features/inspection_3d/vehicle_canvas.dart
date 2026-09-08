import 'package:flutter/material.dart';
import 'check_result.dart';
import 'zone.dart';
import 'body_type.dart';
import '../../core/theme/app_theme.dart';
import 'vehicle_silhouette_painter.dart';
import 'zone_hotspot.dart';

class VehicleCanvas extends StatelessWidget {
  final VehicleBodyType bodyType;
  final ZoneView view;
  final List<InspectionZone> zones;
  final CheckResult Function(String zoneId) resultFor;
  final void Function(InspectionZone zone) onZoneTap;

  const VehicleCanvas({
    super.key,
    required this.bodyType,
    required this.view,
    required this.zones,
    required this.resultFor,
    required this.onZoneTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return Container(
      height: AppMetrics.canvasHeight,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
        border: Border.all(color: AppColors.border),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final size = Size(constraints.maxWidth, constraints.maxHeight);
          return Stack(
            children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: VehicleSilhouettePainter(
                    bodyType: bodyType,
                    view: view,
                    outline: colors.primary
                        .withValues(alpha: AppMetrics.opacityStrong),
                    fill: AppColors.surfaceElevated,
                    detail: AppColors.border,
                  ),
                  isComplex: true,
                ),
              ),
              for (final zone in zones)
                Positioned(
                  left: zone.dx * size.width - AppMetrics.hotspotSize / 2,
                  top: zone.dy * size.height - AppMetrics.hotspotSize / 2,
                  child: ZoneHotspot(
                    result: resultFor(zone.id),
                    onTap: () => onZoneTap(zone),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
