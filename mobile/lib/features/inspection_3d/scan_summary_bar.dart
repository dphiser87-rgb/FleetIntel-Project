import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import 'status_badge.dart';

class ScanSummaryBar extends StatelessWidget {
  final int checked;
  final int total;
  final int defects;

  const ScanSummaryBar({
    super.key,
    required this.checked,
    required this.total,
    required this.defects,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final progress = total == 0 ? 0.0 : checked / total;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '$checked of $total areas confirmed',
                style: text.bodySmall,
              ),
            ),
            if (defects > 0)
              StatusBadge(
                label: '$defects defect${defects == 1 ? '' : 's'}',
                color: AppColors.danger,
              ),
          ],
        ),
        const SizedBox(height: AppMetrics.spacingSm),
        ClipRRect(
          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: AppMetrics.spacingXs + 2,
            backgroundColor: AppColors.surfaceElevated,
            valueColor: AlwaysStoppedAnimation<Color>(colors.primary),
          ),
        ),
      ],
    );
  }
}
