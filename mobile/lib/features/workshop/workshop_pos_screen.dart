import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/fleet_card.dart';
import '../../core/widgets/status_badge.dart';
import 'workshop_ui.dart';

/// Mobile port of the FleetHub-Workshop reference's workshop/pos.tsx -- purchase order list +
/// finance mark-paid-with-proof.
class WorkshopPosScreen extends ConsumerStatefulWidget {
  const WorkshopPosScreen({super.key});

  @override
  ConsumerState<WorkshopPosScreen> createState() => _WorkshopPosScreenState();
}

class _WorkshopPosScreenState extends ConsumerState<WorkshopPosScreen> {
  bool _loading = true;
  List<dynamic> _pos = [];
  String _currency = 'USD';

  String? get _role => ref.read(authControllerProvider).user?['role'] as String?;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([dio.get('/purchase-orders'), dio.get('/workspace')]);
      setState(() {
        _pos = results[0].data as List;
        _currency = ((results[1].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final canPay = _role == 'finance' || _role == 'admin';
    return Scaffold(
      appBar: AppBar(title: const Text('Purchase orders'), centerTitle: true),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _pos.isEmpty
                ? Center(child: Text('No purchase orders yet.', style: text.bodyMedium?.copyWith(color: AppColors.muted)))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.all(AppMetrics.spacingLg),
                      itemCount: _pos.length,
                      itemBuilder: (context, i) {
                        final po = _pos[i] as Map<String, dynamic>;
                        final meta = poStatusMeta(po['status'] as String? ?? 'po_issued');
                        return Padding(
                          padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
                          child: FleetCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(child: Text(po['po_number'] as String? ?? '', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
                                    StatusBadge(label: meta.label, color: meta.color),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(po['supplier'] as String? ?? 'Supplier TBC', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                                    Text(formatMoney(po['amount'] as num?, _currency), style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                                  ],
                                ),
                                if (po['status'] == 'paid' && po['paid_at'] != null)
                                  Text('Paid on ${(po['paid_at'] as String).split('T').first}', style: text.bodySmall?.copyWith(color: AppColors.muted))
                                else if (canPay) ...[
                                  const SizedBox(height: AppMetrics.spacingSm),
                                  SizedBox(
                                    width: double.infinity,
                                    child: FleetButton(
                                      label: 'Mark paid + attach proof', icon: Icons.receipt_long_outlined,
                                      onPressed: () => _showPayModal(context, po),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
      ),
    );
  }

  void _showPayModal(BuildContext context, Map<String, dynamic> po) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(AppMetrics.radiusLarge))),
      builder: (_) => _PayModal(po: po, onPaid: _load),
    );
  }
}

class _PayModal extends ConsumerStatefulWidget {
  const _PayModal({required this.po, required this.onPaid});
  final Map<String, dynamic> po;
  final VoidCallback onPaid;

  @override
  ConsumerState<_PayModal> createState() => _PayModalState();
}

class _PayModalState extends ConsumerState<_PayModal> {
  final _picker = ImagePicker();
  final _supplierController = TextEditingController();
  String? _proofBase64;
  String? _proofFileName;
  bool _uploading = false;
  bool _submitting = false;
  String? _error;

  Future<void> _pickProof() async {
    final XFile? file = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 60);
    if (file == null) return;
    setState(() => _uploading = true);
    try {
      final bytes = await File(file.path).readAsBytes();
      setState(() {
        _proofBase64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
        _proofFileName = file.name;
      });
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _confirm() async {
    if (_proofBase64 == null || _submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final user = ref.read(authControllerProvider).user;
      final dio = ref.read(apiClientProvider).dio;
      await dio.post('/purchase-orders/${widget.po['id']}/mark-paid', data: {
        'proof_of_payment': [
          {
            'file_name': _proofFileName ?? 'proof.jpg',
            'file_type': 'image/jpeg',
            'file_size': _proofBase64!.length,
            'uploaded_by': user?['id'],
            'uploaded_at': DateTime.now().toUtc().toIso8601String(),
            'data_url': _proofBase64,
          },
        ],
      });
      if (mounted) {
        Navigator.of(context).pop();
        widget.onPaid();
      }
    } catch (_) {
      setState(() => _error = 'Could not mark paid.');
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
          Text('Mark ${widget.po['po_number']} paid', style: text.headlineSmall),
          const SizedBox(height: 4),
          Text('Attach proof of payment (image) to close the PO.', style: text.bodySmall?.copyWith(color: AppColors.muted)),
          const SizedBox(height: AppMetrics.spacingMd),
          TextField(controller: _supplierController, decoration: const InputDecoration(hintText: 'e.g. Bosch Auto Parts SA')),
          const SizedBox(height: AppMetrics.spacingMd),
          Text('PROOF OF PAYMENT', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
          const SizedBox(height: AppMetrics.spacingSm),
          GestureDetector(
            onTap: _uploading ? null : _pickProof,
            child: Container(
              width: 110, height: 110,
              decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(AppMetrics.radiusMedium)),
              child: _uploading
                  ? const Center(child: CircularProgressIndicator())
                  : _proofBase64 != null
                      ? Stack(
                          children: [
                            ClipRRect(borderRadius: BorderRadius.circular(AppMetrics.radiusMedium), child: Image.memory(base64Decode(_proofBase64!.split(',').last), fit: BoxFit.cover, width: 110, height: 110)),
                            const Positioned(top: 4, right: 4, child: Icon(Icons.check_circle, color: AppColors.primary, size: 20)),
                          ],
                        )
                      : const Center(child: Icon(Icons.receipt_long_outlined, color: AppColors.muted)),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppMetrics.spacingSm),
            Text(_error!, style: text.bodySmall?.copyWith(color: AppColors.danger)),
          ],
          const SizedBox(height: AppMetrics.spacingLg),
          SizedBox(
            width: double.infinity,
            child: FleetButton(label: 'Confirm payment', isLoading: _submitting, onPressed: (_proofBase64 == null || _uploading) ? null : _confirm),
          ),
        ],
      ),
    );
  }
}
