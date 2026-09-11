import 'dart:convert';

import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Checklist item types and defect-capture rules mirror the backend contract (InspectionAnswer /
/// InspectionIn in server.py): a "fail" answer is not submittable without a defect_type, a photo,
/// and a note. DEFECT_TYPES is validated server-side and documented there as mirroring
/// maintenance.category -- kept as our existing labels rather than the Fleet Hub reference app's
/// different category set (Bodywork/Tyres/Lights/Engine/Brakes/Glass/Other), which would require
/// touching that mirrored system too.
const kDefectTypes = ['tyres', 'engine', 'brakes', 'electrical', 'bodywork', 'general'];

/// Ported from the Fleet Hub reference app's defect-capture.tsx -- category chips, a note field,
/// and a photo capture button, extracted so both the flat and visual inspection screens share one
/// implementation instead of each inlining their own.
class DefectFields extends StatelessWidget {
  final String? defectType;
  final TextEditingController noteController;
  final String? photoDataUrl;
  final ValueChanged<String> onDefectTypeChanged;
  final ValueChanged<String> onNoteChanged;
  final VoidCallback onCapturePhoto;
  final Widget? noteSuffix;

  const DefectFields({
    super.key,
    required this.defectType,
    required this.noteController,
    required this.photoDataUrl,
    required this.onDefectTypeChanged,
    required this.onNoteChanged,
    required this.onCapturePhoto,
    this.noteSuffix,
  });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(AppMetrics.spacingMd),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
        border: Border(left: BorderSide(color: AppColors.danger, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('DEFECT CATEGORY',
              style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 0.8)),
          const SizedBox(height: AppMetrics.spacingSm),
          Wrap(
            spacing: AppMetrics.spacingSm,
            runSpacing: AppMetrics.spacingSm,
            children: kDefectTypes.map((dt) {
              final active = defectType == dt;
              return GestureDetector(
                onTap: () => onDefectTypeChanged(dt),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: AppMetrics.spacingSm),
                  decoration: BoxDecoration(
                    color: active ? AppColors.primary : AppColors.surface,
                    borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                    border: Border.all(color: active ? AppColors.primary : AppColors.border),
                  ),
                  child: Text(
                    dt,
                    style: text.bodySmall?.copyWith(
                      color: active ? AppColors.primaryInk : AppColors.ink,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: AppMetrics.spacingMd),
          Text('NOTES', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 0.8)),
          const SizedBox(height: AppMetrics.spacingSm),
          TextField(
            controller: noteController,
            onChanged: onNoteChanged,
            minLines: 2,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: 'Describe the defect (required)',
              suffixIcon: noteSuffix,
            ),
          ),
          const SizedBox(height: AppMetrics.spacingMd),
          Text('PHOTO', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 0.8)),
          const SizedBox(height: AppMetrics.spacingSm),
          if (photoDataUrl != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
              child: Image.memory(
                base64Decode(photoDataUrl!.split(',').last),
                width: 88,
                height: 88,
                fit: BoxFit.cover,
              ),
            )
          else
            GestureDetector(
              onTap: onCapturePhoto,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingMd),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                  border: Border.all(color: AppColors.border, style: BorderStyle.solid),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.camera_alt_outlined, color: AppColors.primary, size: AppMetrics.iconMd),
                    const SizedBox(width: AppMetrics.spacingSm),
                    Text('Add photo evidence',
                        style: text.bodyMedium?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
