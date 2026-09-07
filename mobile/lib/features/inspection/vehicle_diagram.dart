import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// The mobile checklist app's visual differentiator: a tappable vehicle silhouette that jumps
/// the driver straight to the relevant checklist section, rather than making them scroll and
/// read section headers to find "where do I check the tyres." Hotspot categories match
/// DEFECT_TYPES in server.py (tyres/engine/brakes/electrical/bodywork) plus a general catch-all,
/// so the same vocabulary is used end-to-end from diagram tap to defect-type chip.
enum VehicleHotspot { tyres, engine, brakes, electrical, bodywork }

const kHotspotLabels = {
  VehicleHotspot.tyres: 'Tyres',
  VehicleHotspot.engine: 'Engine',
  VehicleHotspot.brakes: 'Brakes',
  VehicleHotspot.electrical: 'Lights',
  VehicleHotspot.bodywork: 'Body',
};

/// Keywords matched (case-insensitive substring) against checklist item labels to find which
/// item a hotspot tap should scroll to. Deliberately simple string matching rather than a
/// separate per-item category field, since templates aren't authored with one.
const kHotspotKeywords = {
  VehicleHotspot.tyres: ['tire', 'tyre', 'tread', 'wheel'],
  VehicleHotspot.engine: ['engine', 'oil', 'coolant', 'fluid'],
  VehicleHotspot.brakes: ['brake'],
  VehicleHotspot.electrical: ['light', 'signal', 'headlight', 'electrical'],
  VehicleHotspot.bodywork: ['body', 'bodywork', 'panel', 'windshield', 'glass'],
};

class VehicleDiagram extends StatelessWidget {
  const VehicleDiagram({super.key, required this.vehicleType, required this.onTapHotspot});

  final String vehicleType;
  final void Function(VehicleHotspot) onTapHotspot;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 16 / 9,
      child: Stack(
        fit: StackFit.expand,
        children: [
          CustomPaint(painter: _VehiclePainter(vehicleType: vehicleType)),
          ..._hotspotsFor(vehicleType).entries.map(
                (entry) => Positioned(
                  left: entry.value.left,
                  top: entry.value.top,
                  width: entry.value.width,
                  height: entry.value.height,
                  child: _HotspotButton(
                    label: kHotspotLabels[entry.key]!,
                    onTap: () => onTapHotspot(entry.key),
                  ),
                ),
              ),
        ],
      ),
    );
  }

  /// Fractional (0..1 of the widget's own width/height) hotspot placement, per vehicle type --
  /// a van/truck's engine sits at the front, a bus's brakes hotspot needs to be reachable
  /// without overlapping its longer body, etc. Kept as simple fractional rects rather than a
  /// full per-type SVG so adding a vehicle type later is a few numbers, not a new asset.
  Map<VehicleHotspot, Rect> _hotspotsFor(String type) {
    switch (type) {
      case 'truck':
        return {
          VehicleHotspot.engine: const Rect.fromLTWH(0.06, 0.30, 0.16, 0.30),
          VehicleHotspot.electrical: const Rect.fromLTWH(0.02, 0.20, 0.10, 0.18),
          VehicleHotspot.tyres: const Rect.fromLTWH(0.20, 0.68, 0.16, 0.20),
          VehicleHotspot.brakes: const Rect.fromLTWH(0.62, 0.68, 0.16, 0.20),
          VehicleHotspot.bodywork: const Rect.fromLTWH(0.40, 0.28, 0.45, 0.32),
        };
      case 'van':
        return {
          VehicleHotspot.engine: const Rect.fromLTWH(0.04, 0.36, 0.14, 0.24),
          VehicleHotspot.electrical: const Rect.fromLTWH(0.02, 0.30, 0.08, 0.16),
          VehicleHotspot.tyres: const Rect.fromLTWH(0.18, 0.68, 0.16, 0.20),
          VehicleHotspot.brakes: const Rect.fromLTWH(0.66, 0.68, 0.16, 0.20),
          VehicleHotspot.bodywork: const Rect.fromLTWH(0.20, 0.24, 0.60, 0.30),
        };
      case 'bus':
        return {
          VehicleHotspot.engine: const Rect.fromLTWH(0.04, 0.40, 0.12, 0.22),
          VehicleHotspot.electrical: const Rect.fromLTWH(0.02, 0.32, 0.08, 0.16),
          VehicleHotspot.tyres: const Rect.fromLTWH(0.16, 0.70, 0.14, 0.18),
          VehicleHotspot.brakes: const Rect.fromLTWH(0.72, 0.70, 0.14, 0.18),
          VehicleHotspot.bodywork: const Rect.fromLTWH(0.18, 0.20, 0.68, 0.32),
        };
      case 'trailer':
        return {
          VehicleHotspot.tyres: const Rect.fromLTWH(0.16, 0.68, 0.16, 0.20),
          VehicleHotspot.brakes: const Rect.fromLTWH(0.68, 0.68, 0.16, 0.20),
          VehicleHotspot.bodywork: const Rect.fromLTWH(0.10, 0.24, 0.80, 0.34),
          VehicleHotspot.electrical: const Rect.fromLTWH(0.86, 0.34, 0.08, 0.16),
        };
      case 'car':
      default:
        return {
          VehicleHotspot.engine: const Rect.fromLTWH(0.08, 0.34, 0.18, 0.26),
          VehicleHotspot.electrical: const Rect.fromLTWH(0.04, 0.28, 0.10, 0.16),
          VehicleHotspot.tyres: const Rect.fromLTWH(0.22, 0.68, 0.16, 0.20),
          VehicleHotspot.brakes: const Rect.fromLTWH(0.62, 0.68, 0.16, 0.20),
          VehicleHotspot.bodywork: const Rect.fromLTWH(0.30, 0.26, 0.45, 0.30),
        };
    }
  }
}

class _HotspotButton extends StatelessWidget {
  const _HotspotButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.sharp),
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.primary.withValues(alpha: 0.6)),
            borderRadius: BorderRadius.circular(AppRadius.sharp),
            color: AppColors.primary.withValues(alpha: 0.12),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 10, color: AppColors.primary, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }
}

/// Side-view silhouette drawn with simple shapes rather than an imported SVG asset -- keeps the
/// diagram bundle-free and trivially themeable (uses the app's own border/surface colors).
class _VehiclePainter extends CustomPainter {
  _VehiclePainter({required this.vehicleType});

  final String vehicleType;

  @override
  void paint(Canvas canvas, Size size) {
    final body = Paint()
      ..color = AppColors.surfaceElevated
      ..style = PaintingStyle.fill;
    final outline = Paint()
      ..color = AppColors.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final wheel = Paint()
      ..color = AppColors.background
      ..style = PaintingStyle.fill;
    final wheelOutline = Paint()
      ..color = AppColors.muted
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    final bodyRect = switch (vehicleType) {
      'car' => Rect.fromLTWH(size.width * 0.08, size.height * 0.32, size.width * 0.84, size.height * 0.34),
      'trailer' => Rect.fromLTWH(size.width * 0.08, size.height * 0.30, size.width * 0.86, size.height * 0.36),
      _ => Rect.fromLTWH(size.width * 0.04, size.height * 0.24, size.width * 0.92, size.height * 0.42),
    };
    final r = RRect.fromRectAndRadius(bodyRect, const Radius.circular(10));
    canvas.drawRRect(r, body);
    canvas.drawRRect(r, outline);

    final wheelRadius = size.height * 0.11;
    final wheelY = bodyRect.bottom - 2;
    final wheelXs = vehicleType == 'trailer'
        ? [bodyRect.left + bodyRect.width * 0.22, bodyRect.left + bodyRect.width * 0.78]
        : [bodyRect.left + bodyRect.width * 0.26, bodyRect.left + bodyRect.width * 0.74];
    for (final x in wheelXs) {
      canvas.drawCircle(Offset(x, wheelY), wheelRadius, wheel);
      canvas.drawCircle(Offset(x, wheelY), wheelRadius, wheelOutline);
    }

    // Ground line
    canvas.drawLine(
      Offset(0, wheelY + wheelRadius + 4),
      Offset(size.width, wheelY + wheelRadius + 4),
      Paint()..color = AppColors.border,
    );
  }

  @override
  bool shouldRepaint(covariant _VehiclePainter oldDelegate) => oldDelegate.vehicleType != vehicleType;
}
