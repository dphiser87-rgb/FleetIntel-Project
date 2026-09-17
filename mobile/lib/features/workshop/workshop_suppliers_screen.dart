import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/fleet_card.dart';
import 'workshop_ui.dart';

/// Supplier master data, owned by Finance -- "how we can know which supplier is costing more" (the
/// whole reason this exists instead of free text on a PO). Each row's paid_total/po_count comes
/// straight from GET /suppliers' spend rollup.
class WorkshopSuppliersScreen extends ConsumerStatefulWidget {
  const WorkshopSuppliersScreen({super.key});

  @override
  ConsumerState<WorkshopSuppliersScreen> createState() => _WorkshopSuppliersScreenState();
}

class _WorkshopSuppliersScreenState extends ConsumerState<WorkshopSuppliersScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _suppliers = [];
  String _currency = 'USD';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([dio.get('/suppliers'), dio.get('/workspace')]);
      setState(() {
        _suppliers = results[0].data as List;
        _currency = ((results[1].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Could not load suppliers.';
        _loading = false;
      });
    }
  }

  void _showAddSupplierSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(AppMetrics.radiusLarge))),
      builder: (_) => _AddSupplierSheet(onCreated: _load),
    );
  }

  // Creating a supplier is Finance's job alone -- workshop_manager/operations_manager get read access
  // (they're the ones actually contacting suppliers for quotations) but not the ability to add one.
  bool get _canCreate {
    final role = ref.read(authControllerProvider).user?['role'] as String?;
    return role == 'finance' || role == 'admin';
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Suppliers'), centerTitle: true),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!, style: text.bodyMedium?.copyWith(color: AppColors.muted)))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: _suppliers.isEmpty
                        ? ListView(
                            padding: const EdgeInsets.all(AppMetrics.spacingLg),
                            children: [
                              const SizedBox(height: AppMetrics.spacingXl),
                              Center(child: Text('No suppliers yet.', style: text.bodyMedium?.copyWith(color: AppColors.muted))),
                            ],
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(AppMetrics.spacingLg),
                            itemCount: _suppliers.length,
                            itemBuilder: (context, i) {
                              final s = _suppliers[i] as Map<String, dynamic>;
                              final paidTotal = (s['paid_total'] as num?)?.toDouble() ?? 0;
                              final poCount = s['po_count'] as int? ?? 0;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
                                child: FleetCard(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(s['name'] as String? ?? '', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                                      if ((s['contact_name'] as String?)?.isNotEmpty == true) ...[
                                        const SizedBox(height: 2),
                                        Text(s['contact_name'] as String, style: text.bodySmall?.copyWith(color: AppColors.muted)),
                                      ],
                                      const Divider(height: AppMetrics.spacingLg, color: AppColors.border),
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text('PAID TO DATE', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
                                          Text(formatMoney(paidTotal, _currency), style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                                        ],
                                      ),
                                      const SizedBox(height: 2),
                                      Text('$poCount purchase order${poCount == 1 ? '' : 's'} paid', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
      ),
      floatingActionButton: _canCreate
          ? FloatingActionButton(
              backgroundColor: Theme.of(context).colorScheme.primary,
              onPressed: _showAddSupplierSheet,
              child: const Icon(Icons.add, color: AppColors.primaryInk),
            )
          : null,
    );
  }
}

class _AddSupplierSheet extends ConsumerStatefulWidget {
  const _AddSupplierSheet({required this.onCreated});
  final VoidCallback onCreated;

  @override
  ConsumerState<_AddSupplierSheet> createState() => _AddSupplierSheetState();
}

class _AddSupplierSheetState extends ConsumerState<_AddSupplierSheet> {
  final _nameController = TextEditingController();
  final _contactNameController = TextEditingController();
  final _contactEmailController = TextEditingController();
  final _contactPhoneController = TextEditingController();
  bool _submitting = false;
  String? _error;

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty || _submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider).dio;
      await dio.post('/suppliers', data: {
        'name': name,
        'contact_name': _contactNameController.text.trim(),
        'contact_email': _contactEmailController.text.trim(),
        'contact_phone': _contactPhoneController.text.trim(),
      });
      if (mounted) {
        Navigator.of(context).pop();
        widget.onCreated();
      }
    } on Object catch (_) {
      setState(() => _error = 'Could not create supplier -- name may already exist.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.only(
        left: AppMetrics.spacingLg, right: AppMetrics.spacingLg, top: AppMetrics.spacingLg,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppMetrics.spacingLg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('New supplier', style: text.headlineSmall),
          const SizedBox(height: AppMetrics.spacingMd),
          TextField(controller: _nameController, decoration: const InputDecoration(hintText: 'Supplier name (e.g. Bosch Auto Parts SA)')),
          const SizedBox(height: AppMetrics.spacingSm),
          TextField(controller: _contactNameController, decoration: const InputDecoration(hintText: 'Contact name (optional)')),
          const SizedBox(height: AppMetrics.spacingSm),
          TextField(controller: _contactEmailController, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(hintText: 'Contact email (optional)')),
          const SizedBox(height: AppMetrics.spacingSm),
          TextField(controller: _contactPhoneController, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: 'Contact phone (optional)')),
          if (_error != null) ...[
            const SizedBox(height: AppMetrics.spacingSm),
            Text(_error!, style: text.bodySmall?.copyWith(color: AppColors.danger)),
          ],
          const SizedBox(height: AppMetrics.spacingLg),
          SizedBox(
            width: double.infinity,
            child: FleetButton(label: 'Add supplier', isLoading: _submitting, onPressed: _submit),
          ),
        ],
      ),
    );
  }
}
