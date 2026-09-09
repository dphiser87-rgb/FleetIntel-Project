import 'package:flutter/material.dart';
import 'zone.dart';
import 'body_type.dart';
import '../../core/theme/app_theme.dart';

/// Draws a stylised vehicle silhouette for the selected body type and view.
/// Uses flat fills and solid strokes only — no shader gradients — so the
/// diagram renders identically on native Skia (Android/iOS) hardware.
class VehicleSilhouettePainter extends CustomPainter {
  final VehicleBodyType bodyType;
  final ZoneView view;
  final Color outline;
  final Color fill;
  final Color detail;

  VehicleSilhouettePainter({
    required this.bodyType,
    required this.view,
    required this.outline,
    required this.fill,
    required this.detail,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final fillPaint = Paint()
      ..style = PaintingStyle.fill
      ..color = fill;
    final strokePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = AppMetrics.borderThick
      ..strokeJoin = StrokeJoin.round
      ..color = outline;
    final detailPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = AppMetrics.borderDefault
      ..color = detail;

    for (final poly in _bodyPolygons()) {
      final path = _pathFrom(poly, size);
      canvas.drawPath(path, fillPaint);
      canvas.drawPath(path, strokePaint);
    }
    for (final poly in _detailPolygons()) {
      canvas.drawPath(_pathFrom(poly, size), detailPaint);
    }
    if (view == ZoneView.side) {
      for (final wheel in _wheels()) {
        final center = Offset(wheel.dx * size.width, wheel.dy * size.height);
        final radius = wheel.r * size.height;
        canvas.drawCircle(center, radius, fillPaint);
        canvas.drawCircle(center, radius, strokePaint);
        canvas.drawCircle(center, radius * 0.42, detailPaint);
      }
    }
  }

  Path _pathFrom(List<Offset> points, Size size) {
    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final p = Offset(points[i].dx * size.width, points[i].dy * size.height);
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    path.close();
    return path;
  }

  // ---------------------------------------------------------------- geometry

  double get _halfWidth {
    switch (bodyType) {
      case VehicleBodyType.truck:
      case VehicleBodyType.trailer:
      case VehicleBodyType.tautliner:
        return 0.40;
      case VehicleBodyType.bus:
        return 0.38;
      case VehicleBodyType.van:
        return 0.35;
      case VehicleBodyType.suv:
      case VehicleBodyType.bakkie:
        return 0.34;
      case VehicleBodyType.sedan:
        return 0.31;
      case VehicleBodyType.hatchback:
        return 0.28;
    }
  }

  List<List<Offset>> _bodyPolygons() {
    switch (view) {
      case ZoneView.side:
        return [_sideProfile()];
      case ZoneView.front:
      case ZoneView.rear:
        return [_faceProfile()];
      case ZoneView.top:
        return [_topProfile()];
    }
  }

  List<Offset> _sideProfile() {
    switch (bodyType) {
      case VehicleBodyType.truck:
        return const [
          Offset(0.04, 0.70), Offset(0.04, 0.34), Offset(0.09, 0.32),
          Offset(0.15, 0.16), Offset(0.31, 0.15), Offset(0.33, 0.32),
          Offset(0.37, 0.32), Offset(0.37, 0.14), Offset(0.96, 0.14),
          Offset(0.96, 0.70),
        ];
      case VehicleBodyType.trailer:
        return const [
          Offset(0.05, 0.24), Offset(0.96, 0.24), Offset(0.96, 0.66),
          Offset(0.05, 0.66),
        ];
      case VehicleBodyType.tautliner:
        return const [
          Offset(0.04, 0.70), Offset(0.04, 0.34), Offset(0.09, 0.32),
          Offset(0.15, 0.16), Offset(0.31, 0.15), Offset(0.33, 0.32),
          Offset(0.37, 0.32), Offset(0.37, 0.10), Offset(0.96, 0.10),
          Offset(0.96, 0.70),
        ];
      case VehicleBodyType.bus:
        return const [
          Offset(0.04, 0.70), Offset(0.04, 0.30), Offset(0.07, 0.20),
          Offset(0.14, 0.14), Offset(0.90, 0.14), Offset(0.96, 0.20),
          Offset(0.96, 0.70),
        ];
      case VehicleBodyType.van:
        return const [
          Offset(0.05, 0.70), Offset(0.05, 0.44), Offset(0.11, 0.40),
          Offset(0.20, 0.24), Offset(0.36, 0.22), Offset(0.38, 0.20),
          Offset(0.93, 0.20), Offset(0.95, 0.30), Offset(0.95, 0.70),
        ];
      case VehicleBodyType.suv:
        return const [
          Offset(0.06, 0.68), Offset(0.08, 0.44), Offset(0.22, 0.42),
          Offset(0.33, 0.22), Offset(0.70, 0.22), Offset(0.80, 0.44),
          Offset(0.94, 0.46), Offset(0.95, 0.68),
        ];
      case VehicleBodyType.sedan:
        return const [
          Offset(0.05, 0.66), Offset(0.07, 0.50), Offset(0.25, 0.48),
          Offset(0.38, 0.30), Offset(0.63, 0.30), Offset(0.78, 0.48),
          Offset(0.94, 0.52), Offset(0.95, 0.66),
        ];
      case VehicleBodyType.hatchback:
        return const [
          Offset(0.12, 0.66), Offset(0.13, 0.50), Offset(0.27, 0.48),
          Offset(0.38, 0.30), Offset(0.66, 0.30), Offset(0.80, 0.50),
          Offset(0.87, 0.52), Offset(0.87, 0.66),
        ];
      case VehicleBodyType.bakkie:
        return const [
          Offset(0.05, 0.66), Offset(0.06, 0.48), Offset(0.20, 0.46),
          Offset(0.30, 0.26), Offset(0.52, 0.26), Offset(0.58, 0.46),
          Offset(0.95, 0.46), Offset(0.95, 0.66),
        ];
    }
  }

  List<Offset> _faceProfile() {
    final l = 0.5 - _halfWidth;
    final r = 0.5 + _halfWidth;
    return [
      Offset(l, 0.22),
      Offset(r, 0.22),
      Offset(r, 0.74),
      Offset(l, 0.74),
    ];
  }

  List<Offset> _topProfile() {
    final l = 0.5 - _halfWidth * 0.8;
    final r = 0.5 + _halfWidth * 0.8;
    return [
      Offset(l, 0.06),
      Offset(r, 0.06),
      Offset(r, 0.94),
      Offset(l, 0.94),
    ];
  }

  List<List<Offset>> _detailPolygons() {
    final l = 0.5 - _halfWidth;
    final r = 0.5 + _halfWidth;
    switch (view) {
      case ZoneView.side:
        if (bodyType == VehicleBodyType.trailer) {
          return const [
            [Offset(0.20, 0.66), Offset(0.24, 0.66), Offset(0.24, 0.80), Offset(0.20, 0.80)],
            [Offset(0.05, 0.34), Offset(0.96, 0.34)],
          ];
        }
        if (bodyType == VehicleBodyType.tautliner) {
          return const [
            [Offset(0.13, 0.31), Offset(0.18, 0.20), Offset(0.29, 0.20), Offset(0.29, 0.31)],
            [Offset(0.40, 0.10), Offset(0.96, 0.10)],
            [Offset(0.46, 0.10), Offset(0.46, 0.68)],
            [Offset(0.58, 0.10), Offset(0.58, 0.68)],
            [Offset(0.70, 0.10), Offset(0.70, 0.68)],
            [Offset(0.82, 0.10), Offset(0.82, 0.68)],
          ];
        }
        if (bodyType == VehicleBodyType.truck) {
          return [
            _sideWindow(),
            // Side mirror -- a small flag jutting left off the cab, above the window.
            const [Offset(0.11, 0.19), Offset(0.155, 0.185), Offset(0.155, 0.235), Offset(0.115, 0.24)],
            // Door handle.
            const [Offset(0.27, 0.435), Offset(0.32, 0.435), Offset(0.32, 0.45), Offset(0.27, 0.45)],
            // Front bumper block.
            const [Offset(0.04, 0.62), Offset(0.10, 0.62), Offset(0.10, 0.70), Offset(0.02, 0.70)],
            // Fuel tank / chassis cylinder between the axle sets.
            const [Offset(0.40, 0.63), Offset(0.53, 0.63), Offset(0.53, 0.71), Offset(0.40, 0.71)],
          ];
        }
        return [_sideWindow()];
      case ZoneView.front:
      case ZoneView.rear:
        return [
          [
            Offset(l + 0.06, 0.27),
            Offset(r - 0.06, 0.27),
            Offset(r - 0.09, 0.45),
            Offset(l + 0.09, 0.45),
          ],
          [
            Offset(l, 0.63),
            Offset(r, 0.63),
            Offset(r, 0.74),
            Offset(l, 0.74),
          ],
          [
            Offset(l + 0.04, 0.50),
            Offset(l + 0.14, 0.50),
            Offset(l + 0.14, 0.58),
            Offset(l + 0.04, 0.58),
          ],
          [
            Offset(r - 0.14, 0.50),
            Offset(r - 0.04, 0.50),
            Offset(r - 0.04, 0.58),
            Offset(r - 0.14, 0.58),
          ],
        ];
      case ZoneView.top:
        final tl = 0.5 - _halfWidth * 0.8;
        final tr = 0.5 + _halfWidth * 0.8;
        return [
          [
            Offset(tl + 0.04, 0.16),
            Offset(tr - 0.04, 0.16),
            Offset(tr - 0.04, 0.40),
            Offset(tl + 0.04, 0.40),
          ],
          [
            Offset(tl + 0.04, 0.48),
            Offset(tr - 0.04, 0.48),
            Offset(tr - 0.04, 0.88),
            Offset(tl + 0.04, 0.88),
          ],
        ];
    }
  }

  List<Offset> _sideWindow() {
    switch (bodyType) {
      case VehicleBodyType.truck:
        return const [
          Offset(0.13, 0.31), Offset(0.18, 0.20), Offset(0.29, 0.20),
          Offset(0.29, 0.31),
        ];
      case VehicleBodyType.bus:
        return const [
          Offset(0.10, 0.36), Offset(0.14, 0.22), Offset(0.90, 0.22),
          Offset(0.92, 0.36),
        ];
      case VehicleBodyType.van:
        return const [
          Offset(0.10, 0.40), Offset(0.21, 0.26), Offset(0.36, 0.25),
          Offset(0.36, 0.40),
        ];
      case VehicleBodyType.suv:
        return const [
          Offset(0.26, 0.42), Offset(0.35, 0.26), Offset(0.66, 0.26),
          Offset(0.74, 0.42),
        ];
      case VehicleBodyType.sedan:
        return const [
          Offset(0.29, 0.48), Offset(0.40, 0.33), Offset(0.60, 0.33),
          Offset(0.70, 0.48),
        ];
      case VehicleBodyType.hatchback:
        return const [
          Offset(0.31, 0.48), Offset(0.41, 0.33), Offset(0.62, 0.33),
          Offset(0.71, 0.48),
        ];
      case VehicleBodyType.bakkie:
        return const [
          Offset(0.24, 0.46), Offset(0.32, 0.29), Offset(0.50, 0.29),
          Offset(0.53, 0.46),
        ];
      case VehicleBodyType.trailer:
      case VehicleBodyType.tautliner:
        return const [];
    }
  }

  List<_Wheel> _wheels() {
    switch (bodyType) {
      case VehicleBodyType.truck:
        return const [
          _Wheel(0.17, 0.72, 0.085),
          _Wheel(0.77, 0.72, 0.085),
          _Wheel(0.90, 0.72, 0.085),
        ];
      case VehicleBodyType.tautliner:
        return const [
          _Wheel(0.17, 0.72, 0.085),
          _Wheel(0.76, 0.72, 0.085),
          _Wheel(0.89, 0.72, 0.085),
        ];
      case VehicleBodyType.trailer:
        return const [_Wheel(0.79, 0.70, 0.078), _Wheel(0.90, 0.70, 0.078)];
      case VehicleBodyType.bus:
        return const [_Wheel(0.18, 0.72, 0.086), _Wheel(0.82, 0.72, 0.086)];
      case VehicleBodyType.van:
        return const [_Wheel(0.21, 0.72, 0.080), _Wheel(0.80, 0.72, 0.080)];
      case VehicleBodyType.suv:
        return const [_Wheel(0.24, 0.70, 0.088), _Wheel(0.76, 0.70, 0.088)];
      case VehicleBodyType.sedan:
        return const [_Wheel(0.24, 0.68, 0.080), _Wheel(0.76, 0.68, 0.080)];
      case VehicleBodyType.hatchback:
        return const [_Wheel(0.27, 0.68, 0.076), _Wheel(0.74, 0.68, 0.076)];
      case VehicleBodyType.bakkie:
        return const [_Wheel(0.22, 0.68, 0.084), _Wheel(0.78, 0.68, 0.084)];
    }
  }

  @override
  bool shouldRepaint(covariant VehicleSilhouettePainter old) =>
      old.bodyType != bodyType ||
      old.view != view ||
      old.outline != outline ||
      old.fill != fill ||
      old.detail != detail;
}

class _Wheel {
  final double dx;
  final double dy;
  final double r;
  const _Wheel(this.dx, this.dy, this.r);
}
