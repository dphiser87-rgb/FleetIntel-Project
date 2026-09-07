import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/app_localizations.dart';

/// Confirms the vehicle already assigned to this driver (GET /users/me/driver-context) as the
/// default path, but also offers "not my vehicle today" -- a driver can be handed a swapped or
/// borrowed unit, and the backend never actually required vehicle_id to match the driver's
/// assignment (see server.py's _templates_for_vehicle), so this was purely a missing client
/// affordance. Picking a different vehicle re-resolves its templates via
/// GET /users/me/vehicle-templates/{id} rather than reusing the assigned vehicle's list.
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
    final dio = ref.read(apiClientProvider).dio;
    final picked = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      builder: (context) => _VehiclePickerSheet(dio: dio),
    );
    if (picked == null) return;

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
    return Scaffold(
      appBar: AppBar(title: Text(l10n.vehicleConfirmTitle)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              vehicle == null ? 'No vehicle is currently assigned to you.' : l10n.vehicleConfirmSubtitle,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 16),
            if (vehicle != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''} — ${vehicle['plate'] ?? ''}',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      if (_isSubstituted) ...[
                        const SizedBox(height: 4),
                        const Text('Substituted for your usual vehicle',
                            style: TextStyle(color: AppColors.primary, fontSize: 12)),
                      ],
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: _resolvingTemplates ? null : _pickDifferentVehicle,
                child: Text(vehicle == null ? 'Choose a vehicle' : "Not my vehicle today"),
              ),
            ),
            if (_resolvingTemplates)
              const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: LinearProgressIndicator(),
              ),
            const SizedBox(height: 16),
            TextField(
              controller: _odometerController,
              decoration: InputDecoration(labelText: l10n.odometerLabel),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: vehicle == null
                  ? null
                  : () => context.go('/templates', extra: {'vehicle': vehicle, 'templates': _templates}),
              child: Text(l10n.vehicleConfirmYes),
            ),
          ],
        ),
      ),
    );
  }
}

class _VehiclePickerSheet extends StatefulWidget {
  const _VehiclePickerSheet({required this.dio});

  final Dio dio;

  @override
  State<_VehiclePickerSheet> createState() => _VehiclePickerSheetState();
}

class _VehiclePickerSheetState extends State<_VehiclePickerSheet> {
  List<dynamic>? _vehicles;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final response = await widget.dio.get('/users/me/available-vehicles');
      setState(() => _vehicles = Map<String, dynamic>.from(response.data)['vehicles'] as List? ?? []);
    } catch (e) {
      setState(() => _error = 'Could not load vehicles.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Choose a vehicle', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.danger)),
            if (_vehicles == null && _error == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (_vehicles != null)
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: _vehicles!.length,
                  separatorBuilder: (context, index) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final v = Map<String, dynamic>.from(_vehicles![index]);
                    return ListTile(
                      title: Text('${v['make'] ?? ''} ${v['model'] ?? ''}'),
                      subtitle: Text(v['plate'] as String? ?? ''),
                      onTap: () => Navigator.of(context).pop(v),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}
