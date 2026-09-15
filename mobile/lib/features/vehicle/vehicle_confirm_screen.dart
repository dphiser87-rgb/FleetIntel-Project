import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/vehicle_summary_card.dart';
import '../../l10n/app_localizations.dart';

/// Confirms the vehicle already assigned to this driver (GET /users/me/driver-context) as the
/// default path, but also offers "not my vehicle today" via a dedicated /vehicle-picker route --
/// a driver can be handed a swapped or borrowed unit, and the backend never actually required
/// vehicle_id to match the driver's assignment (see server.py's _templates_for_vehicle), so this
/// was purely a missing client affordance. Picking a different vehicle re-resolves its templates
/// via GET /users/me/vehicle-templates/{id} rather than reusing the assigned vehicle's list.
///
/// Ported directly from the Fleet Hub reference app's vehicle-confirm.tsx: a plain header (no
/// decorative hero card -- that "Step 1 of 2" banner was left over from the earlier Primio-based
/// port and isn't part of this reference), a SectionLabel + vehicle Card, "Not my vehicle today"
/// as an inline text link (not a footer button), and a single Continue button in the footer.
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
  String? _odometerError;
  int _syncedCount = 0;
  final _odometerController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
    _flushOutbox();
  }

  Future<void> _flushOutbox() async {
    final outbox = ref.read(outboxRepositoryProvider);
    final before = await outbox.pendingCount();
    if (before == 0) return;
    await outbox.flush();
    final after = await outbox.pendingCount();
    if (mounted && before > after) setState(() => _syncedCount = before - after);
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
    final enteredOdometer = int.tryParse(_odometerController.text) ?? 0;
    final canContinue = vehicle != null && enteredOdometer > 0 && _odometerError == null;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.vehicleConfirmTitle),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/welcome'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () => context.push('/history'),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(AppMetrics.spacingLg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_syncedCount > 0) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(AppMetrics.spacingMd),
                        decoration: BoxDecoration(
                          color: colors.primary.withValues(alpha: AppMetrics.opacitySubtle),
                          borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.refresh, size: 16, color: colors.primary),
                            const SizedBox(width: AppMetrics.spacingSm),
                            Expanded(
                              child: Text(
                                '$_syncedCount offline inspection${_syncedCount > 1 ? 's' : ''} synced.',
                                style: text.bodySmall?.copyWith(color: colors.primary, fontWeight: FontWeight.w600),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppMetrics.spacingMd),
                    ],
                    if (vehicle == null)
                      Container(
                        padding: const EdgeInsets.all(AppMetrics.spacingLg),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated,
                          border: Border.all(color: AppColors.border),
                          borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text("Couldn't load your vehicle", style: text.titleMedium),
                            const SizedBox(height: AppMetrics.spacingXs),
                            Text('No vehicle is currently assigned to you.',
                                style: text.bodyMedium?.copyWith(color: AppColors.muted)),
                          ],
                        ),
                      )
                    else ...[
                      Text('ASSIGNED TO YOU',
                          style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
                      const SizedBox(height: AppMetrics.spacingSm),
                      VehicleSummaryCard(
                        displayName: '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''}'.trim(),
                        typeLabel: (vehicle['type'] as String?) ?? '',
                        plate: (vehicle['plate'] as String?) ?? '',
                        groupLabel: _isSubstituted ? 'Substituted for your usual vehicle' : null,
                        infoLabel: 'Note',
                      ),
                      const SizedBox(height: AppMetrics.spacingSm),
                      GestureDetector(
                        onTap: _resolvingTemplates ? null : _pickDifferentVehicle,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingSm),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.refresh, size: 15, color: colors.primary),
                              const SizedBox(width: AppMetrics.spacingSm),
                              Text(
                                _isSubstituted ? 'Change vehicle' : 'Not my vehicle today?',
                                style: text.bodyMedium?.copyWith(color: colors.primary, fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: AppMetrics.spacingSm),
                      Text('CURRENT ODOMETER',
                          style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1.2)),
                      const SizedBox(height: AppMetrics.spacingSm),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _odometerController,
                              keyboardType: TextInputType.number,
                              style: text.bodyMedium,
                              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                              decoration: InputDecoration(
                                hintText: lastOdometer > 0 ? '$lastOdometer' : null,
                                errorText: _odometerError,
                              ),
                              onChanged: (v) {
                                final value = int.tryParse(v);
                                setState(() {
                                  _odometerError = (value != null && value < lastOdometer)
                                      ? "Reading can't be below the last logged $lastOdometer km."
                                      : null;
                                });
                              },
                            ),
                          ),
                          const SizedBox(width: AppMetrics.spacingMd),
                          Padding(
                            padding: const EdgeInsets.only(top: AppMetrics.spacingMd),
                            child: Text('km', style: text.headlineSmall?.copyWith(color: AppColors.muted)),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
            if (vehicle != null)
              Container(
                padding: const EdgeInsets.fromLTRB(
                  AppMetrics.screenPadding,
                  AppMetrics.spacingMd,
                  AppMetrics.screenPadding,
                  AppMetrics.spacingMd,
                ),
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border(top: BorderSide(color: AppColors.border)),
                ),
                child: FleetButton(
                  label: 'Continue',
                  icon: Icons.chevron_right,
                  isLoading: _resolvingTemplates,
                  onPressed: canContinue
                      ? () => context.go('/templates', extra: {
                            'vehicle': vehicle,
                            'templates': _templates,
                            'odometer': enteredOdometer,
                          })
                      : null,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
