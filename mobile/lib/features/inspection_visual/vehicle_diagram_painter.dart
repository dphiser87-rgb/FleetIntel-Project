import 'package:flutter/material.dart';

/// Direct CustomPainter port of the Fleet Hub reference app's vehicle-diagram.tsx: detailed
/// line-art vehicle diagrams drawn in a 300x200 coordinate space, one variant per body class
/// (bakkie / van / sedan / box-truck-default) x view (side/front/rear/top). Hotspot x/y
/// coordinates (0..1) from templates.visual_parts are authored to land on these silhouettes.
class VehicleDiagramPainter extends CustomPainter {
  VehicleDiagramPainter({required this.vehicleClass, required this.view});

  final String vehicleClass;
  final String view;

  static const _line = Color(0xFFE4E4E7);
  static const _glass = Color(0xFF064E3B);
  static const _wheel = Color(0xFFA3A3AD);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 300, size.height / 200);

    final stroke = Paint()
      ..color = _line
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final thin = Paint()
      ..color = _line.withValues(alpha: 0.7)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    final glassFill = Paint()..color = _glass;
    final glassStroke = Paint()
      ..color = _line
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6;
    final wheelFill = Paint()..color = _wheel.withValues(alpha: 0.8);

    void wheel(double cx, {double outerR = 22, double innerR = 9, double outerW = 2.4}) {
      final outer = Paint()
        ..color = _wheel
        ..style = PaintingStyle.stroke
        ..strokeWidth = outerW;
      final inner = Paint()
        ..color = _wheel
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2;
      canvas.drawCircle(Offset(cx, 150), outerR, outer);
      canvas.drawCircle(Offset(cx, 150), innerR, inner);
    }

    void rrect(Rect r, double rx, Paint paint) {
      canvas.drawRRect(RRect.fromRectAndRadius(r, Radius.circular(rx)), paint);
    }

    final cls = vehicleClass.toLowerCase();

    if (view == 'front' || view == 'rear') {
      final boxy = cls == 'truck' || cls == 'van' || cls == 'trailer' || cls == 'tautliner';
      rrect(Rect.fromLTWH(92, boxy ? 44 : 58, 116, boxy ? 112 : 98), boxy ? 6 : 14, stroke);
      if (view == 'front') {
        rrect(Rect.fromLTWH(104, boxy ? 54 : 68, 92, 34), 3, glassFill);
        rrect(Rect.fromLTWH(104, boxy ? 54 : 68, 92, 34), 3, glassStroke);
        rrect(Rect.fromLTWH(118, 112, 64, 18), 2, thin);
        rrect(Rect.fromLTWH(99, 110, 16, 12), 2, glassFill);
        rrect(Rect.fromLTWH(99, 110, 16, 12), 2, glassStroke..strokeWidth = 1.4);
        rrect(Rect.fromLTWH(185, 110, 16, 12), 2, glassFill);
        rrect(Rect.fromLTWH(185, 110, 16, 12), 2, glassStroke);
        rrect(Rect.fromLTWH(88, 78, 8, 12), 2, stroke);
        rrect(Rect.fromLTWH(204, 78, 8, 12), 2, stroke);
      } else {
        rrect(Rect.fromLTWH(108, boxy ? 52 : 66, 84, 30), 3, glassFill);
        rrect(Rect.fromLTWH(108, boxy ? 52 : 66, 84, 30), 3, glassStroke);
        rrect(Rect.fromLTWH(108, 96, 84, 52), 2, thin);
        canvas.drawLine(const Offset(150, 96), const Offset(150, 148), thin);
        rrect(Rect.fromLTWH(99, 118, 13, 16), 2, glassFill);
        rrect(Rect.fromLTWH(99, 118, 13, 16), 2, glassStroke..strokeWidth = 1.4);
        rrect(Rect.fromLTWH(188, 118, 13, 16), 2, glassFill);
        rrect(Rect.fromLTWH(188, 118, 13, 16), 2, glassStroke);
      }
      rrect(Rect.fromLTWH(90, boxy ? 148 : 138, 120, 14), 2, stroke);
    } else if (view == 'top') {
      rrect(Rect.fromLTWH(40, 64, 220, 72), 12, stroke);
      canvas.drawLine(const Offset(112, 64), const Offset(112, 136), thin);
      final p = Path()
        ..moveTo(60, 78)
        ..lineTo(104, 78)
        ..lineTo(100, 92)
        ..lineTo(64, 92)
        ..close();
      canvas.drawPath(p, glassFill);
      canvas.drawPath(p, glassStroke..strokeWidth = 1.4);
      rrect(Rect.fromLTWH(128, 74, 124, 52), 3, thin);
      for (final xy in const [[54.0, 50.0], [54.0, 138.0], [222.0, 50.0], [222.0, 138.0]]) {
        rrect(Rect.fromLTWH(xy[0], xy[1], 22, 12), 3, wheelFill);
      }
    } else if (cls == 'bakkie') {
      final p = Path()
        ..moveTo(20, 152)
        ..lineTo(20, 126)
        ..lineTo(34, 118)
        ..lineTo(74, 104)
        ..lineTo(92, 74)
        ..lineTo(176, 74)
        ..lineTo(184, 104)
        ..lineTo(288, 104)
        ..lineTo(288, 152);
      canvas.drawPath(p, stroke);
      canvas.drawLine(const Offset(20, 152), const Offset(288, 152), stroke);
      final windscreen = Path()
        ..moveTo(96, 100)
        ..lineTo(104, 80)
        ..lineTo(126, 80)
        ..lineTo(126, 100)
        ..close();
      canvas.drawPath(windscreen, glassFill);
      canvas.drawPath(windscreen, glassStroke);
      rrect(Rect.fromLTWH(132, 80, 34, 20), 1, glassFill);
      rrect(Rect.fromLTWH(132, 80, 34, 20), 1, glassStroke);
      canvas.drawLine(const Offset(126, 104), const Offset(126, 146), thin);
      canvas.drawLine(const Offset(150, 104), const Offset(150, 146), thin);
      canvas.drawLine(const Offset(172, 104), const Offset(172, 146), thin);
      canvas.drawLine(const Offset(140, 124), const Offset(148, 124), thin);
      canvas.drawLine(const Offset(162, 124), const Offset(170, 124), thin);
      canvas.drawLine(const Offset(188, 110), const Offset(286, 110), thin);
      rrect(Rect.fromLTWH(14, 126, 12, 20), 2, stroke);
      canvas.drawLine(const Offset(92, 90), const Offset(84, 86), stroke);
      rrect(Rect.fromLTWH(78, 82, 7, 8), 1, stroke);
      rrect(Rect.fromLTWH(116, 146, 80, 7), 2, thin);
      canvas.drawArc(Rect.fromCircle(center: const Offset(90, 132), radius: 29), 3.14159, 3.14159, false, stroke);
      canvas.drawArc(Rect.fromCircle(center: const Offset(214, 132), radius: 29), 3.14159, 3.14159, false, stroke);
      wheel(90, outerR: 24, innerR: 10, outerW: 2.6);
      wheel(214, outerR: 24, innerR: 10, outerW: 2.6);
    } else if (cls == 'van') {
      final body = Path()
        ..moveTo(30, 150)
        ..lineTo(30, 98)
        ..cubicTo(30, 84, 42, 80, 56, 80)
        ..lineTo(120, 80)
        ..lineTo(120, 60)
        ..lineTo(268, 60)
        ..lineTo(268, 150)
        ..close();
      canvas.drawPath(body, stroke);
      final windscreen = Path()
        ..moveTo(60, 96)
        ..lineTo(96, 96)
        ..lineTo(96, 116)
        ..lineTo(44, 116)
        ..cubicTo(46, 104, 52, 96, 60, 96)
        ..close();
      canvas.drawPath(windscreen, glassFill);
      canvas.drawPath(windscreen, glassStroke);
      rrect(Rect.fromLTWH(132, 72, 124, 62), 2, thin);
      canvas.drawLine(const Offset(100, 118), const Offset(116, 118), thin);
      wheel(90);
      wheel(210);
    } else if (cls == 'sedan' || cls == 'hatchback' || cls == 'suv') {
      final body = Path()
        ..moveTo(28, 150)
        ..lineTo(44, 118)
        ..cubicTo(60, 110, 80, 108, 96, 106)
        ..lineTo(128, 82)
        ..lineTo(184, 82)
        ..lineTo(214, 108)
        ..cubicTo(236, 110, 258, 116, 272, 122)
        ..lineTo(272, 150)
        ..close();
      canvas.drawPath(body, stroke);
      final windscreen = Path()
        ..moveTo(104, 104)
        ..lineTo(132, 86)
        ..lineTo(172, 86)
        ..lineTo(196, 104)
        ..close();
      canvas.drawPath(windscreen, glassFill);
      canvas.drawPath(windscreen, glassStroke);
      canvas.drawLine(const Offset(150, 86), const Offset(150, 104), thin);
      canvas.drawLine(const Offset(44, 150), const Offset(44, 140), thin);
      wheel(90);
      wheel(210);
    } else {
      // box truck (default for truck / trailer / tautliner / bus)
      rrect(Rect.fromLTWH(112, 44, 168, 104), 4, stroke);
      final cab = Path()
        ..moveTo(40, 148)
        ..lineTo(40, 108)
        ..cubicTo(40, 92, 52, 84, 66, 84)
        ..lineTo(112, 84)
        ..lineTo(112, 148)
        ..close();
      canvas.drawPath(cab, stroke);
      final windscreen = Path()
        ..moveTo(74, 92)
        ..lineTo(106, 92)
        ..lineTo(106, 110)
        ..lineTo(64, 110)
        ..cubicTo(66, 98, 70, 92, 74, 92)
        ..close();
      canvas.drawPath(windscreen, glassFill);
      canvas.drawPath(windscreen, glassStroke);
      rrect(Rect.fromLTWH(76, 112, 32, 34), 2, thin);
      canvas.drawLine(const Offset(100, 128), const Offset(104, 128), thin);
      canvas.drawLine(const Offset(58, 96), const Offset(50, 90), stroke);
      rrect(Rect.fromLTWH(48, 86, 6, 8), 1, stroke);
      canvas.drawLine(const Offset(40, 148), const Offset(280, 148), stroke);
      rrect(Rect.fromLTWH(30, 136, 12, 12), 2, stroke);
      canvas.drawLine(const Offset(150, 44), const Offset(150, 148), thin);
      canvas.drawLine(const Offset(215, 44), const Offset(215, 148), thin);
      wheel(92);
      wheel(214);
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant VehicleDiagramPainter oldDelegate) =>
      oldDelegate.vehicleClass != vehicleClass || oldDelegate.view != view;
}
