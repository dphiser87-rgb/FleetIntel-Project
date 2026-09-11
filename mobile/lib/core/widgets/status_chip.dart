import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Ported from the Fleet Hub reference app's status-chip.tsx -- an icon+color+label chip for a
/// check/defect status, distinct from the generic StatusBadge (which has no icon/border).
class StatusChip extends StatelessWidget {
  final String status; // pass | warning | critical | fail | na

  const StatusChip({super.key, required this.status});

  static ({Color color, String label, IconData icon}) _config(String s) {
    switch (s) {
      case 'critical':
        return (color: AppColors.danger, label: 'Critical', icon: Icons.close);
      case 'fail':
        return (color: AppColors.danger, label: 'Fail', icon: Icons.close);
      case 'warning':
        return (color: AppColors.warning, label: 'Warning', icon: Icons.warning_amber_rounded);
      case 'na':
        return (color: AppColors.muted, label: 'N/A', icon: Icons.remove);
      default:
        return (color: AppColors.primary, label: 'Pass', icon: Icons.check);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final c = _config(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingSm, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: c.color),
        borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(c.icon, size: 13, color: c.color),
          const SizedBox(width: AppMetrics.spacingXs),
          Text(
            c.label,
            style: text.labelSmall?.copyWith(color: c.color, fontWeight: FontWeight.w800, letterSpacing: 0.4),
          ),
        ],
      ),
    );
  }
}
