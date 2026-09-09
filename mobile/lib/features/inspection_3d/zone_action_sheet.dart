import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/theme/app_theme.dart';
import 'check_result.dart';
import 'zone.dart';

/// One zone's answer: result plus the evidence required when it's Warning/Critical -- same
/// evidence-capture rule the flat checklist and the backend both already enforce (note + photo
/// required on any failing item).
class ZoneAnswer {
  ZoneAnswer({this.result = CheckResult.none, this.note = '', this.photoDataUrl});

  CheckResult result;
  String note;
  String? photoDataUrl;

  bool get needsEvidence => result == CheckResult.warning || result == CheckResult.fail;
  bool get hasRequiredEvidence => note.trim().isNotEmpty && photoDataUrl != null;

  /// A zone only really counts as confirmed once any required evidence is actually there --
  /// picking Critical then backing out of the sheet (device back, tapping the scrim) leaves
  /// `result` set but shouldn't count toward "areas confirmed" or unblock submit, since the
  /// backend rejects a fail/critical answer with no note+photo anyway.
  bool get isComplete => result != CheckResult.none && (!needsEvidence || hasRequiredEvidence);
}

Future<void> showZoneActionSheet({
  required BuildContext context,
  required InspectionZone zone,
  required ZoneAnswer answer,
  required VoidCallback onChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
      side: BorderSide(color: AppColors.border),
    ),
    builder: (sheetContext) => _ZoneActionSheet(zone: zone, answer: answer, onChanged: onChanged),
  );
}

class _ZoneActionSheet extends StatefulWidget {
  final InspectionZone zone;
  final ZoneAnswer answer;
  final VoidCallback onChanged;

  const _ZoneActionSheet({required this.zone, required this.answer, required this.onChanged});

  @override
  State<_ZoneActionSheet> createState() => _ZoneActionSheetState();
}

class _ZoneActionSheetState extends State<_ZoneActionSheet> {
  final _picker = ImagePicker();
  late final _noteController = TextEditingController(text: widget.answer.note);

  Future<void> _capturePhoto() async {
    final photo = await _picker.pickImage(source: ImageSource.camera, imageQuality: 60);
    if (photo == null) return;
    final bytes = await photo.readAsBytes();
    setState(() => widget.answer.photoDataUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}');
    widget.onChanged();
  }

  void _select(CheckResult result) {
    setState(() => widget.answer.result = result);
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final answer = widget.answer;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppMetrics.screenPadding,
          AppMetrics.screenPadding,
          AppMetrics.screenPadding,
          AppMetrics.screenPadding + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.zone.view.label.toUpperCase(),
                style: text.labelSmall?.copyWith(color: colors.primary, fontWeight: FontWeight.w700, letterSpacing: 1.2),
              ),
              const SizedBox(height: AppMetrics.spacingSm),
              Text(widget.zone.label, style: text.titleLarge),
              const SizedBox(height: AppMetrics.spacingXs),
              Text(widget.zone.hint, style: text.bodySmall),
              const SizedBox(height: AppMetrics.spacingLg),
              Row(
                children: [
                  Expanded(child: _ChoiceButton(label: 'Pass', icon: Icons.check_rounded, color: colors.primary, selected: answer.result == CheckResult.pass, onTap: () => _select(CheckResult.pass))),
                  const SizedBox(width: AppMetrics.spacingSm),
                  Expanded(child: _ChoiceButton(label: 'Warning', icon: Icons.warning_amber_rounded, color: AppColors.warning, selected: answer.result == CheckResult.warning, onTap: () => _select(CheckResult.warning))),
                ],
              ),
              const SizedBox(height: AppMetrics.spacingSm),
              Row(
                children: [
                  Expanded(child: _ChoiceButton(label: 'Critical', icon: Icons.priority_high_rounded, color: AppColors.danger, selected: answer.result == CheckResult.fail, onTap: () => _select(CheckResult.fail))),
                  const SizedBox(width: AppMetrics.spacingSm),
                  Expanded(child: _ChoiceButton(label: 'N/A', icon: Icons.remove_rounded, color: AppColors.muted, selected: answer.result == CheckResult.na, onTap: () => _select(CheckResult.na))),
                ],
              ),
              if (answer.needsEvidence) ...[
                const SizedBox(height: AppMetrics.spacingLg),
                Text('Describe the issue *', style: text.labelMedium),
                const SizedBox(height: AppMetrics.spacingSm),
                TextField(
                  controller: _noteController,
                  maxLines: 2,
                  style: text.bodyMedium,
                  onChanged: (v) { answer.note = v; widget.onChanged(); },
                  decoration: const InputDecoration(hintText: 'What did you find?'),
                ),
                const SizedBox(height: AppMetrics.spacingSm),
                OutlinedButton.icon(
                  onPressed: _capturePhoto,
                  icon: Icon(answer.photoDataUrl != null ? Icons.check_circle_outline : Icons.camera_alt_outlined),
                  label: Text(answer.photoDataUrl != null ? 'Photo captured' : 'Add photo (required)'),
                ),
              ],
              const SizedBox(height: AppMetrics.spacingLg),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: (!answer.needsEvidence || answer.hasRequiredEvidence)
                      ? () => Navigator.of(context).pop()
                      : null,
                  child: const Text('Done'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChoiceButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  const _ChoiceButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: AppMetrics.buttonHeight,
        decoration: BoxDecoration(
          color: selected
              ? color.withValues(alpha: AppMetrics.opacitySubtle)
              : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
          border: Border.all(
            color: selected ? color : AppColors.border,
            width: selected ? AppMetrics.borderThick : AppMetrics.borderDefault,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: AppMetrics.iconSm + 2, color: color),
            const SizedBox(width: AppMetrics.spacingSm),
            Text(
              label,
              style: text.labelLarge?.copyWith(color: color),
            ),
          ],
        ),
      ),
    );
  }
}
