import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';

/// Ported from the Fleet Hub reference app's inspection/complete.tsx -- shown after a real submit
/// succeeds (online or queued offline), for both the flat and visual inspection screens.
class InspectionCompleteScreen extends StatelessWidget {
  const InspectionCompleteScreen({
    super.key,
    required this.overallStatus, // 'pass' | 'warning' | 'critical'
    required this.defectCount,
    required this.queued,
  });

  final String overallStatus;
  final int defectCount;
  final bool queued;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final (Color color, IconData icon, String title, String copy) = switch (overallStatus) {
      'critical' => (
          AppColors.danger,
          Icons.warning_amber_rounded,
          'Inspection submitted',
          'Critical defects were logged. Your fleet manager has been notified — do not operate the vehicle until cleared.',
        ),
      'warning' => (
          AppColors.warning,
          Icons.warning_amber_rounded,
          'Inspection submitted',
          'Warnings were logged and flagged for follow-up. Drive with caution and report any changes.',
        ),
      _ => (
          AppColors.primary,
          Icons.check_circle_outline,
          'All clear',
          'No defects found. Your vehicle is cleared for the trip. Drive safe.',
        ),
    };

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  border: Border.all(color: color, width: 2),
                  borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                ),
                child: Icon(icon, size: 48, color: color),
              ),
              const SizedBox(height: AppMetrics.spacingLg),
              Text(title, style: text.headlineLarge, textAlign: TextAlign.center),
              const SizedBox(height: AppMetrics.spacingSm),
              Text(copy, style: text.bodyMedium?.copyWith(color: AppColors.muted), textAlign: TextAlign.center),
              const SizedBox(height: AppMetrics.spacingMd),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppMetrics.spacingLg),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        children: [
                          Text('$defectCount', style: text.headlineMedium?.copyWith(color: color)),
                          const SizedBox(height: 4),
                          Text('Defects logged', style: text.labelSmall?.copyWith(color: AppColors.muted), textAlign: TextAlign.center),
                        ],
                      ),
                    ),
                    Container(width: 1, height: 40, color: AppColors.border),
                    Expanded(
                      child: Column(
                        children: [
                          Text(queued ? 'Queued' : 'Synced', style: text.headlineMedium),
                          const SizedBox(height: 4),
                          Text(
                            queued ? 'Will sync when online' : 'Saved to server',
                            style: text.labelSmall?.copyWith(color: AppColors.muted),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (queued) ...[
                const SizedBox(height: AppMetrics.spacingMd),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppMetrics.spacingMd),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.cloud_off_outlined, size: 16, color: AppColors.warning),
                      const SizedBox(width: AppMetrics.spacingSm),
                      Expanded(
                        child: Text(
                          "Saved offline. It will sync automatically next time you're connected.",
                          style: text.bodySmall?.copyWith(color: AppColors.ink),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const Spacer(),
              FleetButton(
                label: 'Done',
                onPressed: () {
                  Navigator.of(context).pop(); // close inspection screen (pushed outside go_router)
                  context.go('/welcome');
                },
              ),
              const SizedBox(height: AppMetrics.spacingLg),
            ],
          ),
        ),
      ),
    );
  }
}
