import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/hero_banner.dart';
import '../../core/widgets/vehicle_summary_card.dart';
import '../../l10n/app_localizations.dart';

/// Confirms the vehicle already assigned to this driver (GET /users/me/driver-context) as the
/// default path, but also offers "not my vehicle today" via a dedicated /vehicle-picker route --
/// a driver can be handed a swapped or borrowed unit, and the backend never actually required
/// vehicle_id to match the driver's assignment (see server.py's _templates_for_vehicle), so this
/// was purely a missing client affordance. Picking a different vehicle re-resolves its templates
/// via GET /users/me/vehicle-templates/{id} rather than reusing the assigned vehicle's list.
///
/// Visual layout ported from the Primio-designed reference app's vehicle_confirm_screen.dart.
class VehicleConfirmScreen extends ConsumerStatefulWidget {
  const VehicleConfirmScreen({super.key});

  @override
  ConsumerState<VehicleConfirmScreen> createState() => _VehicleConfirmScreenState();
}

class _VehicleConfirmScreenState extends ConsumerState<VehicleConfirmScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _selectedVehicle;
  List<dynamic> _templates = [];
  bool _isSubstituted = false;
  bool _resolvingTemplates = false;
  final _odometerController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final response = await dio.get('/users/me/driver-context');
      final data = Map<String, dynamic>.from(response.data);
      setState(() {
        _selectedVehicle = data['vehicle'] as Map<String, dynamic>?;
        _templates = data['templates'] as List? ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _pickDifferentVehicle() async {
    final picked = await context.push<Map<String, dynamic>>('/vehicle-picker');
    if (picked == null || !mounted) return;

    final dio = ref.read(apiClientProvider).dio;
    setState(() => _resolvingTemplates = true);
    try {
      final response = await dio.get('/users/me/vehicle-templates/${picked['id']}');
      final data = Map<String, dynamic>.from(response.data);
      setState(() {
        _selectedVehicle = data['vehicle'] as Map<String, dynamic>?;
        _templates = data['templates'] as List? ?? [];
        _isSubstituted = true;
        _resolvingTemplates = false;
      });
    } catch (e) {
      setState(() => _resolvingTemplates = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not load that vehicle. Please try again.')),
        );
      }
    }
  }

  @override
  void dispose() {
    _odometerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_error != null) {
      return Scaffold(body: Center(child: Text(_error!)));
    }

    final vehicle = _selectedVehicle;
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final lastOdometer = (vehicle?['odometer'] as num?)?.toInt() ?? 0;
    final canContinue = vehicle != null && (int.tryParse(_odometerController.text) ?? 0) > 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.vehicleConfirmTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/welcome'),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: AppMetrics.screenPadding),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: AppMetrics.spacingMd),
                    HeroBanner(
                      eyebrow: 'Step 1 of 2',
                      title: 'Confirm your\nvehicle',
                      subtitle: vehicle == null
                          ? 'No vehicle is currently assigned to you.'
                          : 'Check the details below and capture the odometer.',
                      icon: Icons.local_shipping_rounded,
                    ),
                    const SizedBox(height: AppMetrics.spacingLg),
                    if (vehicle != null) ...[
                      VehicleSummaryCard(
                        displayName: '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''}'.trim(),
                        typeLabel: (vehicle['type'] as String?) ?? '',
                        plate: (vehicle['plate'] as String?) ?? '',
                        groupLabel: _isSubstituted ? 'Substituted for your usual vehicle' : null,
                        infoLabel: 'Note',
                      ),
                      const SizedBox(height: AppMetrics.spacingLg),
                      Text('ODOMETER READING (KM)',
                          style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
                      const SizedBox(height: AppMetrics.spacingSm),
                      TextField(
                        controller: _odometerController,
                        keyboardType: TextInputType.number,
                        style: text.bodyMedium,
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        decoration: InputDecoration(
                          hintText: 'e.g. ${lastOdometer + 120}',
                          prefixIcon: Icon(Icons.speed_rounded, color: colors.primary, size: AppMetrics.iconMd),
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                      if (lastOdometer > 0) ...[
                        const SizedBox(height: AppMetrics.spacingSm),
                        Text('Last recorded: $lastOdometer km', style: text.bodySmall),
                      ],
                    ],
                    const SizedBox(height: AppMetrics.spacingLg),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppMetrics.screenPadding,
                0,
                AppMetrics.screenPadding,
                AppMetrics.spacingMd,
              ),
              child: Column(
                children: [
                  FleetButton(
                    label: 'Not my vehicle today',
                    icon: Icons.swap_horiz_rounded,
                    isOutlined: true,
                    onPressed: _resolvingTemplates ? null : _pickDifferentVehicle,
                  ),
                  const SizedBox(height: AppMetrics.spacingSm + 4),
                  FleetButton(
                    label: l10n.vehicleConfirmYes,
                    isLoading: _resolvingTemplates,
                    onPressed: canContinue
                        ? () => context.go('/templates', extra: {'vehicle': vehicle, 'templates': _templates})
                        : null,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
