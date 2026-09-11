import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/vehicle_summary_card.dart';

/// Full-screen vehicle picker for the "not my vehicle today" flow -- ported from the
/// Primio-designed reference app's structure (a dedicated /vehicle-picker route rather than an
/// inline bottom sheet), backed by our real GET /users/me/available-vehicles. Selecting a vehicle
/// pops back to VehicleConfirmScreen with the picked vehicle map, which then resolves its
/// templates via GET /users/me/vehicle-templates/{id}.
class VehiclePickerScreen extends ConsumerStatefulWidget {
  const VehiclePickerScreen({super.key});

  @override
  ConsumerState<VehiclePickerScreen> createState() => _VehiclePickerScreenState();
}

class _VehiclePickerScreenState extends ConsumerState<VehiclePickerScreen> {
  List<dynamic>? _vehicles;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final response = await dio.get('/users/me/available-vehicles');
      setState(() => _vehicles = Map<String, dynamic>.from(response.data)['vehicles'] as List? ?? []);
    } catch (e) {
      setState(() => _error = 'Could not load vehicles.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Choose a vehicle')),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_error != null) {
              return Center(child: Text(_error!, style: text.bodyMedium?.copyWith(color: AppColors.danger)));
            }
            if (_vehicles == null) {
              return const Center(child: CircularProgressIndicator());
            }
            if (_vehicles!.isEmpty) {
              return Center(child: Text('No other vehicles available.', style: text.bodyMedium));
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(
                horizontal: AppMetrics.screenPadding,
                vertical: AppMetrics.spacingMd,
              ),
              itemCount: _vehicles!.length,
              separatorBuilder: (context, index) => const SizedBox(height: AppMetrics.spacingSm),
              itemBuilder: (context, index) {
                final v = Map<String, dynamic>.from(_vehicles![index]);
                return VehicleSummaryCard(
                  displayName: '${v['make'] ?? ''} ${v['model'] ?? ''}'.trim(),
                  typeLabel: (v['type'] as String?) ?? '',
                  plate: (v['plate'] as String?) ?? '',
                  showDetails: false,
                  onTap: () => context.pop(v),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
