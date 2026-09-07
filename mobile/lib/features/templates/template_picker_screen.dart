import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../inspection/inspection_screen.dart';
import '../inspection_3d/inspection_3d_screen.dart';

/// Lists the checklist templates resolved for the confirmed vehicle (from the same
/// driver-context payload the vehicle-confirm screen already fetched). Phase 1 mockup
/// target -- selecting a template will hand off into the Inspection flow in Phase 2.
class TemplatePickerScreen extends StatelessWidget {
  const TemplatePickerScreen({super.key, this.driverContext});

  final Map<String, dynamic>? driverContext;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final templates = (driverContext?['templates'] as List?) ?? [];
    final vehicle = driverContext?['vehicle'] as Map?;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.templatePickerTitle)),
      body: templates.isEmpty
          ? const Center(child: Text('No checklist templates assigned to this vehicle.'))
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: templates.length,
              separatorBuilder: (context, index) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final template = Map<String, dynamic>.from(templates[index]);
                return Card(
                  child: ListTile(
                    title: Text(template['name'] as String? ?? 'Untitled'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: vehicle == null
                        ? null
                        : () {
                            final is3D = template['asset_class'] != null && template['node_checklist'] != null;
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (context) => is3D
                                    ? Inspection3DScreen(template: template, vehicle: Map<String, dynamic>.from(vehicle))
                                    : InspectionScreen(template: template, vehicle: Map<String, dynamic>.from(vehicle)),
                              ),
                            );
                          },
                  ),
                );
              },
            ),
    );
  }
}
