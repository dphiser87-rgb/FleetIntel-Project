import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/hero_banner.dart';
import '../../core/widgets/template_card.dart';
import '../../l10n/app_localizations.dart';
import '../inspection/inspection_screen.dart';
import '../inspection_visual/inspection_visual_screen.dart';

/// Lists the checklist templates resolved for the confirmed vehicle (from the same
/// driver-context payload the vehicle-confirm screen already fetched).
///
/// Visual layout ported from the Fleet Hub reference app's templates.tsx. Templates with
/// `asset_class` set (the slot the parked 3D concept used to occupy) now route to the new
/// InspectionVisualScreen instead of being filtered out -- inspection_3d/ stays untouched, just
/// unreachable from here.
class TemplatePickerScreen extends StatelessWidget {
  const TemplatePickerScreen({super.key, this.driverContext});

  final Map<String, dynamic>? driverContext;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final text = Theme.of(context).textTheme;
    final allTemplates = (driverContext?['templates'] as List?) ?? [];
    final templates = allTemplates.map((t) => Map<String, dynamic>.from(t as Map)).toList();
    final vehicle = driverContext?['vehicle'] as Map?;
    final odometer = (driverContext?['odometer'] as num?)?.toDouble() ?? 0;
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
                Text('ASSIGNED TEMPLATES', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
                const SizedBox(height: AppMetrics.spacingMd),
                for (final template in templates) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppMetrics.spacingSm + 4),
                    child: _templateCard(context, template, vehicle, odometer),
                  ),
                ],
              ],
              const SizedBox(height: AppMetrics.spacingLg),
            ],
          ),
        ),
      ),
    );
  }

  Widget _templateCard(BuildContext context, Map<String, dynamic> template, Map? vehicle, double odometer) {
    final isVisual = template['asset_class'] != null;
    final itemCount = isVisual
        ? (template['visual_parts'] as List?)?.length ?? 0
        : ((template['sections'] as List?) ?? [])
            .map((s) => Map<String, dynamic>.from(s))
            .fold<int>(0, (sum, s) => sum + ((s['items'] as List?)?.length ?? 0));
    final unit = isVisual ? 'parts' : 'items';

    return TemplateCard(
      name: (template['name'] as String?) ?? 'Untitled',
      description: (template['description'] as String?) ?? '',
      meta: '$itemCount $unit',
      isVisual: isVisual,
      onTap: vehicle == null
          ? () {}
          : () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (context) => isVisual
                      ? InspectionVisualScreen(
                          template: template,
                          vehicle: Map<String, dynamic>.from(vehicle),
                          odometer: odometer,
                        )
                      : InspectionScreen(
                          template: template,
                          vehicle: Map<String, dynamic>.from(vehicle),
                          odometer: odometer,
                        ),
                ),
              ),
    );
  }
}
