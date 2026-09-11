import 'package:flutter/material.dart';
import 'package:signature/signature.dart';
import '../theme/app_theme.dart';

/// Ported from the Fleet Hub reference app's signature-pad.tsx -- an inline drawing surface (not a
/// modal/bottom-sheet step) with a "Sign here" placeholder and a "Clear signature" text link.
/// Rasterizes to PNG via the existing `signature` package controller (already a dependency), kept
/// as a base64 PNG on submit rather than the reference's raw SVG path strings, to match our real
/// backend's InspectionIn.signature contract.
class SignaturePad extends StatefulWidget {
  final SignatureController controller;
  final double height;

  const SignaturePad({super.key, required this.controller, this.height = 180});

  @override
  State<SignaturePad> createState() => _SignaturePadState();
}

class _SignaturePadState extends State<SignaturePad> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          height: widget.height,
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            border: Border.all(color: AppColors.border),
            borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
          ),
          child: Stack(
            children: [
              Signature(controller: widget.controller, backgroundColor: Colors.transparent),
              if (widget.controller.isEmpty)
                Center(
                  child: Text('Sign here', style: text.bodyMedium?.copyWith(color: AppColors.muted)),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppMetrics.spacingSm),
        Align(
          alignment: Alignment.centerRight,
          child: GestureDetector(
            onTap: widget.controller.clear,
            child: Text(
              'Clear signature',
              style: text.bodyMedium?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ],
    );
  }
}
