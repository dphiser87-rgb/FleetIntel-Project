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
              // Soft radial vignette behind the silhouette, matching Primio's reference art --
              // the painter itself stays flat-fill only (still true, still cheap to draw); this
              // is a separate decorative layer, not something baked into VehicleSilhouettePainter.
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      colors: [Color(0xFF2A2A30), AppColors.surface],
                      stops: const [0.0, 0.85],
                      radius: 0.85,
                    ),
                  ),
                ),
              ),
              Positioned.fill(
                child: CustomPaint(
                  painter: VehicleSilhouettePainter(
                    bodyType: bodyType,
                    view: view,
                    outline: AppColors.ink.withValues(alpha: 0.82),
                    fill: Colors.transparent,
                    detail: AppColors.ink.withValues(alpha: 0.5),
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
