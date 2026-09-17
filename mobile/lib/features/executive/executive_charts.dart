import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../workshop/workshop_ui.dart';

/// Cost-component palette, ported 1:1 from the FleetHub-Executives reference's exec-charts.tsx --
/// these three colors are fixed regardless of workspace brand color, matching the reference exactly.
const Map<String, Color> kCostCategoryColors = {
  'maintenance': Color(0xFF4F8EF7),
  'tyres': Color(0xFFB57BFF),
  'parts': Color(0xFF35C77A),
};
const Map<String, String> kCostCategoryLabels = {
  'maintenance': 'Maintenance',
  'tyres': 'Tyres',
  'parts': 'Parts',
};

/// Stacked monthly bar chart -- pure Container/Column drawing (no charting package), matching the
/// reference's own plain-View implementation exactly. `data` items need month/label/maintenance/
/// tyres/parts/total keys, as returned by the monthly_trend list on every executive-dashboard
/// endpoint.
class TrendChart extends StatelessWidget {
  const TrendChart({super.key, required this.data, required this.currency, this.hiddenCategories = const {}});
  final List<dynamic> data;
  final String currency;
  /// Categories toggled off via TrendLegend -- excluded from both the bar heights and the max-height
  /// scale, so isolating "Maintenance" re-scales the chart to that category alone rather than just
  /// hiding segments within bars still sized for the full stack.
  final Set<String> hiddenCategories;

  double _visibleTotal(Map<String, dynamic> m) {
    const keys = ['parts', 'tyres', 'maintenance'];
    return keys.where((k) => !hiddenCategories.contains(k)).fold<double>(0, (s, k) => s + ((m[k] as num?) ?? 0).toDouble());
  }

  @override
  Widget build(BuildContext context) {
    final maxTotal = data.isEmpty
        ? 1.0
        : data.map((m) => _visibleTotal(m as Map<String, dynamic>)).reduce((a, b) => a > b ? a : b).clamp(1.0, double.infinity);
    return SizedBox(
      height: 160,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final m in data)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: Container(
                        height: (_visibleTotal(m) / maxTotal * 130).clamp(4.0, 130.0),
                        decoration: const BoxDecoration(color: AppColors.surfaceElevated),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            for (final k in const ['parts', 'tyres', 'maintenance'])
                              if (!hiddenCategories.contains(k)) _segment(m, k, (_visibleTotal(m) / maxTotal * 130).clamp(4.0, 130.0)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(_monthAbbr(m['month'] as String? ?? ''), style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _segment(Map<String, dynamic> m, String key, double barHeight) {
    final total = _visibleTotal(m);
    final v = ((m[key] as num?) ?? 0).toDouble();
    final h = total > 0 ? (v / total) * barHeight : 0.0;
    return Container(height: h, color: kCostCategoryColors[key]);
  }

  static String _monthAbbr(String monthKey) {
    const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final parts = monthKey.split('-');
    if (parts.length != 2) return monthKey;
    final mo = int.tryParse(parts[1]) ?? 0;
    return mo >= 1 && mo <= 12 ? names[mo] : monthKey;
  }
}

class TrendLegend extends StatelessWidget {
  const TrendLegend({super.key, this.hiddenCategories = const {}, this.onToggle});
  final Set<String> hiddenCategories;
  final ValueChanged<String>? onToggle;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: AppMetrics.spacingMd,
      children: [
        for (final k in const ['maintenance', 'tyres', 'parts'])
          GestureDetector(
            onTap: onToggle == null ? null : () => onToggle!(k),
            child: Opacity(
              opacity: hiddenCategories.contains(k) ? 0.35 : 1,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 10, height: 10, decoration: BoxDecoration(color: kCostCategoryColors[k], borderRadius: BorderRadius.circular(3))),
                  const SizedBox(width: 6),
                  Text(kCostCategoryLabels[k]!, style: const TextStyle(fontSize: 12, color: AppColors.ink, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Donut chart drawn with Canvas.drawArc -- the Flutter equivalent of the reference's react-native-svg
/// stroked-circle approach, no new package needed. `slices` items need name/value/pct keys (matching
/// the ytd_breakdown/breakdown shape every executive-dashboard endpoint already returns).
class CostDonut extends StatelessWidget {
  const CostDonut({super.key, required this.slices, required this.total, required this.currency, this.centerLabel = 'TOTAL', this.onTapCategory});
  final List<dynamic> slices;
  final double total;
  final String currency;
  final String centerLabel;
  final ValueChanged<String>? onTapCategory;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 118,
          height: 118,
          child: CustomPaint(
            painter: _DonutPainter(slices: slices),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(centerLabel, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 1)),
                  const SizedBox(height: 2),
                  Text(formatMoney(total, currency), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.ink), maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: AppMetrics.spacingMd),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final s in slices)
                GestureDetector(
                  onTap: onTapCategory == null ? null : () => onTapCategory!(s['name'] as String),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(width: 10, height: 10, decoration: BoxDecoration(color: kCostCategoryColors[(s['name'] as String).toLowerCase()] ?? AppColors.primary, borderRadius: BorderRadius.circular(3))),
                                  const SizedBox(width: 6),
                                  Expanded(child: Text(s['name'] as String, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: AppColors.ink, fontWeight: FontWeight.w700))),
                                ],
                              ),
                              Padding(
                                padding: const EdgeInsets.only(left: 16, top: 1),
                                child: Text('${s['pct']}% · ${formatMoney((s['value'] as num?) ?? 0, currency)}', style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        ),
                        if (onTapCategory != null) const Icon(Icons.chevron_right, size: 16, color: AppColors.muted),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter({required this.slices});
  final List<dynamic> slices;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.shortestSide - 22) / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);
    const strokeWidth = 22.0;

    final track = Paint()
      ..color = AppColors.surfaceElevated
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;
    canvas.drawArc(rect, 0, 6.2832, false, track);

    var startAngle = -1.5708; // -90deg, matches the reference's rotate(-90)
    for (final s in slices) {
      final pct = ((s['pct'] as num?) ?? 0).toDouble();
      if (pct <= 0) continue;
      final sweep = pct / 100 * 6.28319;
      final paint = Paint()
        ..color = kCostCategoryColors[(s['name'] as String).toLowerCase()] ?? AppColors.primary
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth;
      canvas.drawArc(rect, startAngle, sweep, false, paint);
      startAngle += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter oldDelegate) => oldDelegate.slices != slices;
}
