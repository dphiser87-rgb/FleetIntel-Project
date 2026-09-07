import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../l10n/app_localizations.dart';

/// Confirms the vehicle already assigned to this driver (GET /users/me/driver-context)
/// rather than presenting an open picker, then captures the odometer reading before
/// moving on to template selection. Phase 1 mockup target -- data wiring only for now.
class VehicleConfirmScreen extends ConsumerStatefulWidget {
  const VehicleConfirmScreen({super.key});

  @override
  ConsumerState<VehicleConfirmScreen> createState() => _VehicleConfirmScreenState();
}

class _VehicleConfirmScreenState extends ConsumerState<VehicleConfirmScreen> {
  Map<String, dynamic>? _context;
  bool _loading = true;
  String? _error;
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
      setState(() {
        _context = Map<String, dynamic>.from(response.data);
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
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
    final vehicle = _context?['vehicle'] as Map<String, dynamic>?;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.vehicleConfirmTitle)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.vehicleConfirmSubtitle, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 16),
            if (vehicle != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''} — ${vehicle['registration'] ?? vehicle['plate'] ?? ''}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
              )
            else
              const Text('No vehicle currently assigned.'),
            const SizedBox(height: 24),
            TextField(
              controller: _odometerController,
              decoration: InputDecoration(labelText: l10n.odometerLabel),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: vehicle == null
                  ? null
                  : () => context.go('/templates', extra: _context),
              child: Text(l10n.vehicleConfirmYes),
            ),
          ],
        ),
      ),
    );
  }
}
