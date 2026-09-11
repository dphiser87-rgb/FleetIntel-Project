import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'fleet_button.dart';
import 'status_chip.dart';

class FlaggedReviewItem {
  final String label;
  final String status;
  final String category;
  final String note;
  final bool hasPhoto;

  const FlaggedReviewItem({
    required this.label,
    required this.status,
    required this.category,
    required this.note,
    required this.hasPhoto,
  });
}

/// Ported from the Fleet Hub reference app's review-sheet.tsx -- a bottom sheet summarizing flagged
/// defects (or a clean "no defects" state) shown before the final submit, so a driver confirms what
/// they're about to send rather than it happening silently on the last button tap.
Future<void> showReviewSheet(
  BuildContext context, {
  required List<FlaggedReviewItem> flagged,
  required int totalCount,
  required Future<void> Function() onConfirm,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surfaceElevated,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppMetrics.radiusLarge)),
    ),
    builder: (context) => _ReviewSheetContent(flagged: flagged, totalCount: totalCount, onConfirm: onConfirm),
  );
}

class _ReviewSheetContent extends StatefulWidget {
  const _ReviewSheetContent({required this.flagged, required this.totalCount, required this.onConfirm});

  final List<FlaggedReviewItem> flagged;
  final int totalCount;
  final Future<void> Function() onConfirm;

  @override
  State<_ReviewSheetContent> createState() => _ReviewSheetContentState();
}

class _ReviewSheetContentState extends State<_ReviewSheetContent> {
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final clean = widget.flagged.isEmpty;

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (context, scrollController) => SingleChildScrollView(
        controller: scrollController,
        padding: EdgeInsets.only(
          left: AppMetrics.spacingLg,
          right: AppMetrics.spacingLg,
          top: AppMetrics.spacingLg,
          bottom: AppMetrics.spacingLg + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Review & submit', style: text.headlineMedium),
            const SizedBox(height: AppMetrics.spacingSm),
            Text(
              clean
                  ? 'All ${widget.totalCount} checks passed — no defects to report.'
                  : '${widget.flagged.length} of ${widget.totalCount} checks flagged. Confirm the defects below before signing off.',
              style: text.bodyMedium?.copyWith(color: AppColors.muted),
            ),
            const SizedBox(height: AppMetrics.spacingLg),
            if (clean)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingXl),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                ),
                child: Column(
                  children: [
                    const Icon(Icons.check_circle_outline, color: AppColors.primary, size: 28),
                    const SizedBox(height: AppMetrics.spacingSm),
                    Text('No defects found', style: text.titleMedium),
                  ],
                ),
              )
            else
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('FLAGGED DEFECTS', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
                  const SizedBox(height: AppMetrics.spacingSm),
                  for (final f in widget.flagged)
                    Container(
                      margin: const EdgeInsets.only(bottom: AppMetrics.spacingSm),
                      padding: const EdgeInsets.all(AppMetrics.spacingMd),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                        border: Border(left: BorderSide(color: AppColors.danger, width: 3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Text(f.label, style: text.titleSmall?.copyWith(color: AppColors.ink))),
                              StatusChip(status: f.status),
                            ],
                          ),
                          const SizedBox(height: AppMetrics.spacingSm),
                          Wrap(
                            spacing: AppMetrics.spacingSm,
                            children: [
                              if (f.category.isNotEmpty)
                                _Tag(text: f.category),
                              if (f.hasPhoto) const _Tag(text: 'Photo', icon: Icons.camera_alt_outlined),
                            ],
                          ),
                          if (f.note.isNotEmpty) ...[
                            const SizedBox(height: AppMetrics.spacingSm),
                            Text(f.note, style: text.bodyMedium?.copyWith(color: AppColors.muted)),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            const SizedBox(height: AppMetrics.spacingLg),
            FleetButton(
              label: 'Confirm & submit',
              isLoading: _submitting,
              onPressed: _submitting
                  ? null
                  : () async {
                      setState(() => _submitting = true);
                      await widget.onConfirm();
                      if (mounted) setState(() => _submitting = false);
                    },
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.text, this.icon});

  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingSm, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: AppColors.primary),
            const SizedBox(width: 4),
          ],
          Text(text, style: t.labelSmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
