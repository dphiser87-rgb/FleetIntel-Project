import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/hero_banner.dart';
import '../../core/widgets/template_card.dart';
import '../../l10n/app_localizations.dart';
import '../inspection/inspection_screen.dart';

/// Lists the checklist templates resolved for the confirmed vehicle (from the same
/// driver-context payload the vehicle-confirm screen already fetched).
///
/// Visual layout ported from the Primio-designed reference app's template_picker_screen.dart.
/// 3D is parked for now: templates with asset_class set are excluded from this list entirely
/// (trivial to remove once 3D resumes -- nothing about Inspection3DScreen or its routing is
/// touched).
class TemplatePickerScreen extends StatelessWidget {
  const TemplatePickerScreen({super.key, this.driverContext});

  final Map<String, dynamic>? driverContext;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final text = Theme.of(context).textTheme;
    final allTemplates = (driverContext?['templates'] as List?) ?? [];
    final templates = allTemplates
        .map((t) => Map<String, dynamic>.from(t as Map))
        .where((t) => t['asset_class'] == null)
        .toList();
    final vehicle = driverContext?['vehicle'] as Map?;
    final vehicleName = vehicle == null ? null : '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''}'.trim();

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.templatePickerTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/vehicle'),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.screenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: AppMetrics.spacingMd),
              HeroBanner(
                eyebrow: 'Step 2 of 2',
                title: 'Choose your\nchecklist',
                subtitle: vehicleName == null ? 'Select the inspection type to begin.' : 'For $vehicleName',
                icon: Icons.fact_check_rounded,
              ),
              const SizedBox(height: AppMetrics.spacingLg),
              if (templates.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingXl),
                  child: Center(
                    child: Text('No checklist templates assigned to this vehicle.', style: text.bodyMedium),
                  ),
                )
              else ...[
                Text('STANDARD CHECKLISTS', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
                const SizedBox(height: AppMetrics.spacingMd),
                for (final template in templates) ...[
                  TemplateCard(
                    name: (template['name'] as String?) ?? 'Untitled',
                    subtitle: 'Standard checklist',
                    onTap: vehicle == null
                        ? () {}
                        : () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (context) => InspectionScreen(
                                  template: template,
                                  vehicle: Map<String, dynamic>.from(vehicle),
                                ),
                              ),
                            ),
                  ),
                  const SizedBox(height: AppMetrics.spacingSm + 4),
                ],
              ],
              const SizedBox(height: AppMetrics.spacingLg),
            ],
          ),
        ),
      ),
    );
  }
}
