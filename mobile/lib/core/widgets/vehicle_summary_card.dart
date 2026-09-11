import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'fleet_card.dart';
import 'status_badge.dart';

IconData vehicleTypeIcon(String? type) {
  switch (type) {
    case 'truck':
    case 'tautliner':
      return Icons.local_shipping_outlined;
    case 'trailer':
      return Icons.rv_hookup_outlined;
    case 'bus':
      return Icons.directions_bus_outlined;
    case 'van':
    case 'suv':
      return Icons.airport_shuttle_outlined;
    case 'bakkie':
      return Icons.fire_truck_outlined;
    case 'sedan':
    case 'hatchback':
    default:
      return Icons.directions_car_outlined;
  }
}

/// Ported from the Primio-designed reference app's widgets/vehicle/vehicle_summary_card.dart,
/// decoupled from their Vehicle model -- takes plain fields so it works against our real
/// vehicles-table map shape (make/model/plate/type/group_id, etc.) instead of a typed class.
class VehicleSummaryCard extends StatelessWidget {
  final String displayName;
  final String typeLabel;
  final String plate;
  final String? groupLabel;
  final String infoLabel;
  final bool showDetails;
  final VoidCallback? onTap;
  final bool selected;

  const VehicleSummaryCard({
    super.key,
    required this.displayName,
    required this.typeLabel,
    required this.plate,
    this.groupLabel,
    this.infoLabel = 'Group',
    this.showDetails = true,
    this.onTap,
    this.selected = false,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    return FleetCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: AppMetrics.avatarMd,
                height: AppMetrics.avatarMd,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      colors.primary.withValues(alpha: AppMetrics.opacityGlow),
                      colors.primary.withValues(alpha: AppMetrics.opacitySubtle),
                    ],
                    stops: const [0.0, 1.0],
                  ),
                  borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                ),
                child: Icon(vehicleTypeIcon(typeLabel.toLowerCase()), color: colors.primary, size: AppMetrics.iconMd),
              ),
              const SizedBox(width: AppMetrics.spacingSm + 4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(displayName, style: text.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text(
                      typeLabel.isEmpty ? plate : '$typeLabel · $plate',
                      style: text.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (selected)
                StatusBadge(label: 'Selected', color: colors.primary)
              else if (showDetails)
                StatusBadge(label: 'Assigned', color: colors.primary)
              else
                Icon(Icons.chevron_right, color: AppColors.muted, size: AppMetrics.iconMd),
            ],
          ),
          if (showDetails && groupLabel != null) ...[
            const SizedBox(height: AppMetrics.spacingMd),
            Divider(color: AppColors.border, height: AppMetrics.borderDefault),
            const SizedBox(height: AppMetrics.spacingMd),
            _InfoRow(label: infoLabel, value: groupLabel!),
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: text.bodySmall),
        Text(value, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
      ],
    );
  }
}
