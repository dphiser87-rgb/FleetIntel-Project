import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/fleet_card.dart';
import '../../core/widgets/status_badge.dart';
import 'workshop_ui.dart';

const _kTabs = ['Overview', 'Parts', 'Activity', 'Photos'];

/// Mobile port of the FleetHub-Workshop reference's workshop/job/[id].tsx. Uses the app's existing
/// custom-segmented-control pattern (see inspection_3d/view_switcher.dart) for tabs, since there's no
/// TabBar/TabController precedent anywhere in this codebase.
class WorkshopJobDetailScreen extends ConsumerStatefulWidget {
  const WorkshopJobDetailScreen({super.key, required this.jobId});
  final String jobId;

  @override
  ConsumerState<WorkshopJobDetailScreen> createState() => _WorkshopJobDetailScreenState();
}

class _WorkshopJobDetailScreenState extends ConsumerState<WorkshopJobDetailScreen> {
  bool _loading = true;
  int _tab = 0;
  Map<String, dynamic>? _job;
  List<dynamic> _requisitions = [];
  List<dynamic> _quotes = [];
  List<dynamic> _purchaseOrders = [];
  List<dynamic> _activity = [];
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
      final results = await Future.wait([
        dio.get('/maintenance/${widget.jobId}'),
        dio.get('/maintenance/${widget.jobId}/parts-requisitions'),
        dio.get('/maintenance/${widget.jobId}/quotes'),
        dio.get('/purchase-orders'),
        dio.get('/audit', queryParameters: {'entity_id': widget.jobId}),
        dio.get('/workspace'),
      ]);
      final allPos = results[3].data as List;
      setState(() {
        _job = results[0].data as Map<String, dynamic>;
        _requisitions = results[1].data as List;
        _quotes = results[2].data as List;
        _purchaseOrders = allPos.where((p) => p['maintenance_id']?.toString() == widget.jobId).toList();
        _activity = results[4].data as List;
        _currency = ((results[5].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: _loading || _job == null
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg, vertical: AppMetrics.spacingSm),
                    child: Row(
                      children: [
                        IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => context.pop()),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
                    child: _SegmentedControl(labels: _kTabs, index: _tab, onChanged: (i) => setState(() => _tab = i)),
                  ),
                  const SizedBox(height: AppMetrics.spacingMd),
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: _load,
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(AppMetrics.spacingLg, 0, AppMetrics.spacingLg, AppMetrics.spacingXl * 2),
                        child: switch (_tab) {
                          0 => _OverviewTab(job: _job!, currency: _currency, role: _role, onStatusChanged: _load),
                          1 => _PartsTab(
                              job: _job!, requisitions: _requisitions, quotes: _quotes, purchaseOrders: _purchaseOrders,
                              currency: _currency, role: _role, onChanged: _load,
                            ),
                          2 => _ActivityTab(activity: _activity),
                          _ => _PhotosTab(job: _job!, role: _role, onChanged: _load),
                        },
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _SegmentedControl extends StatelessWidget {
  const _SegmentedControl({required this.labels, required this.index, required this.onChanged});
  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(AppMetrics.radiusMedium)),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingSm),
                  decoration: BoxDecoration(
                    color: i == index ? AppColors.surfaceElevated : Colors.transparent,
                    borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                  ),
                  alignment: Alignment.center,
                  child: Text(labels[i], style: text.labelMedium?.copyWith(color: i == index ? AppColors.ink : AppColors.muted, fontWeight: FontWeight.w700)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _OverviewTab extends ConsumerStatefulWidget {
  const _OverviewTab({required this.job, required this.currency, required this.role, required this.onStatusChanged});
  final Map<String, dynamic> job;
  final String currency;
  final String? role;
  final VoidCallback onStatusChanged;

  @override
  ConsumerState<_OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends ConsumerState<_OverviewTab> {
  bool _updating = false;

  Future<void> _setStatus(String status) async {
    setState(() => _updating = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      await dio.patch('/maintenance/${widget.job['id']}', data: {'status': status});
      widget.onStatusChanged();
    } catch (_) {
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final job = widget.job;
    final status = job['status'] as String? ?? 'pending';
    final priority = job['priority'] as String? ?? 'medium';
    final canMove = widget.role == 'mechanic' || widget.role == 'workshop_manager' || widget.role == 'admin';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            StatusBadge(label: priority.toUpperCase(), color: kPriorityColors[priority] ?? AppColors.muted),
            const Spacer(),
            StatusBadge(label: kJobStatusLabels[status] ?? status, color: kJobStatusColors[status] ?? AppColors.muted),
          ],
        ),
        const SizedBox(height: AppMetrics.spacingSm),
        Text(job['title'] as String? ?? '', style: text.displayLarge?.copyWith(fontSize: 22)),
        const SizedBox(height: 4),
        Row(
          children: [
            const Icon(Icons.local_shipping_outlined, size: 14, color: AppColors.muted),
            const SizedBox(width: 4),
            Text('${job['vehicle_name'] ?? '—'} · ${job['vehicle_plate'] ?? ''}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
          ],
        ),
        if ((job['description'] as String?)?.isNotEmpty == true) ...[
          const SizedBox(height: AppMetrics.spacingLg),
          Text('DESCRIPTION', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
          const SizedBox(height: 4),
          Text(job['description'] as String, style: text.bodyMedium?.copyWith(height: 1.4)),
        ],
        const SizedBox(height: AppMetrics.spacingLg),
        FleetCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('PARTS COST ATTRIBUTED', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
              const SizedBox(height: 4),
              Text(formatMoney(job['parts_cost'] as num?, widget.currency), style: text.displayLarge?.copyWith(fontSize: 26)),
              const SizedBox(height: 4),
              Text('Assigned to ${job['assigned_to_name'] ?? '—'}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
            ],
          ),
        ),
        if (canMove) ...[
          const SizedBox(height: AppMetrics.spacingLg),
          Text('MOVE JOB', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
          const SizedBox(height: AppMetrics.spacingSm),
          Wrap(
            spacing: AppMetrics.spacingSm,
            runSpacing: AppMetrics.spacingSm,
            children: [
              for (final entry in kJobStatusLabels.entries)
                _StatusButton(
                  label: entry.value,
                  color: kJobStatusColors[entry.key]!,
                  active: status == entry.key,
                  disabled: _updating,
                  onTap: () => _setStatus(entry.key),
                ),
            ],
          ),
          const SizedBox(height: AppMetrics.spacingSm),
          Text('The job moves independently of parts approvals.', style: text.bodySmall?.copyWith(color: AppColors.muted)),
        ],
      ],
    );
  }
}

class _StatusButton extends StatelessWidget {
  const _StatusButton({required this.label, required this.color, required this.active, required this.disabled, required this.onTap});
  final String label;
  final Color color;
  final bool active;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return GestureDetector(
      onTap: active || disabled ? null : onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: AppMetrics.spacingSm),
        decoration: BoxDecoration(
          color: active ? color.withValues(alpha: 0.12) : AppColors.surface,
          border: Border.all(color: active ? color : AppColors.border),
          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
        ),
        child: Text(label, style: text.labelMedium?.copyWith(color: active ? color : AppColors.ink, fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _PartsTab extends ConsumerWidget {
  const _PartsTab({
    required this.job, required this.requisitions, required this.quotes, required this.purchaseOrders,
    required this.currency, required this.role, required this.onChanged,
  });
  final Map<String, dynamic> job;
  final List<dynamic> requisitions;
  final List<dynamic> quotes;
  final List<dynamic> purchaseOrders;
  final String currency;
  final String? role;
  final VoidCallback onChanged;

  bool get _hasOpenReq => requisitions.any((r) => r['status'] == 'pending_approval');
  bool get _canRequest => role == 'mechanic' || role == 'workshop_manager' || role == 'admin';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    if (requisitions.isEmpty && quotes.isEmpty && purchaseOrders.isEmpty && !_canRequest) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingXl),
        child: Center(child: Text('No parts requested for this job yet.', style: text.bodyMedium?.copyWith(color: AppColors.muted))),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!_hasOpenReq && _canRequest)
          SizedBox(
            width: double.infinity,
            child: FleetButton(
              label: 'Request parts', icon: Icons.add,
              onPressed: () async {
                await context.push('/workshop/requisition/${job['id']}');
                onChanged();
              },
            ),
          ),
        const SizedBox(height: AppMetrics.spacingMd),
        for (final r in requisitions) _RequisitionCard(req: r, currency: currency, role: role, onChanged: onChanged),
        for (final q in quotes) _QuoteCard(quote: q, currency: currency, role: role, onChanged: onChanged),
        for (final po in purchaseOrders) _PoCardMini(po: po, currency: currency, role: role),
      ],
    );
  }
}

Future<void> _showRejectSheet(BuildContext context, Future<void> Function(String reason) onReject) async {
  final controller = TextEditingController();
  await showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surfaceElevated,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(AppMetrics.radiusLarge))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(
        left: AppMetrics.spacingLg, right: AppMetrics.spacingLg, top: AppMetrics.spacingLg,
        bottom: MediaQuery.of(ctx).viewInsets.bottom + AppMetrics.spacingLg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Reason for rejection', style: Theme.of(ctx).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text('Required — the requester will see this.', style: Theme.of(ctx).textTheme.bodySmall?.copyWith(color: AppColors.muted)),
          const SizedBox(height: AppMetrics.spacingMd),
          TextField(controller: controller, maxLines: 3, decoration: const InputDecoration(hintText: 'e.g. Wrong part number for this vehicle')),
          const SizedBox(height: AppMetrics.spacingLg),
          SizedBox(
            width: double.infinity,
            child: FleetButton(
              label: 'Reject',
              onPressed: controller.text.trim().isEmpty
                  ? null
                  : () async {
                      Navigator.of(ctx).pop();
                      await onReject(controller.text.trim());
                    },
            ),
          ),
        ],
      ),
    ),
  );
}

class _RequisitionCard extends ConsumerWidget {
  const _RequisitionCard({required this.req, required this.currency, required this.role, required this.onChanged});
  final Map<String, dynamic> req;
  final String currency;
  final String? role;
  final VoidCallback onChanged;

  Future<void> _decide(BuildContext context, WidgetRef ref, String decision, {String? reason}) async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      await dio.post('/parts-requisitions/${req['id']}/decide', data: {'decision': decision, 'reason': reason ?? ''});
      onChanged();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final status = req['status'] as String? ?? 'pending_approval';
    final meta = requisitionStatusMeta(status);
    final items = (req['items'] as List?) ?? [];
    final canDecide = status == 'pending_approval' && (role == 'workshop_manager' || role == 'admin');
    final total = items.fold<double>(0, (s, i) => s + ((i['qty_requested'] ?? 0) as num) * ((i['unit_cost'] ?? 0) as num));

    return Padding(
      padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
      child: FleetCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Parts requisition', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800))),
                StatusBadge(label: meta.label, color: meta.color),
              ],
            ),
            Text('Requested by ${req['requested_by_name'] ?? 'a technician'}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
            const SizedBox(height: AppMetrics.spacingSm),
            for (final it in items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Expanded(child: Text(it['part_name'] as String? ?? '', style: text.bodySmall)),
                    Text('×${it['qty_requested']}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                  ],
                ),
              ),
            const Divider(height: AppMetrics.spacingLg, color: AppColors.border),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Requisition total', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                Text(formatMoney(total, currency), style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
              ],
            ),
            if (status == 'rejected' && (req['decision'] as Map?)?['reason'] != null) ...[
              const SizedBox(height: AppMetrics.spacingSm),
              Text('Reason: ${(req['decision'] as Map)['reason']}', style: text.bodySmall?.copyWith(color: AppColors.danger)),
            ],
            if (canDecide) ...[
              const SizedBox(height: AppMetrics.spacingMd),
              Row(
                children: [
                  Expanded(child: FleetButton(label: 'Approve', onPressed: () => _decide(context, ref, 'approved'))),
                  const SizedBox(width: AppMetrics.spacingSm),
                  Expanded(
                    child: FleetButton(
                      label: 'Reject', isOutlined: true,
                      onPressed: () => _showRejectSheet(context, (reason) => _decide(context, ref, 'rejected', reason: reason)),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _QuoteCard extends ConsumerWidget {
  const _QuoteCard({required this.quote, required this.currency, required this.role, required this.onChanged});
  final Map<String, dynamic> quote;
  final String currency;
  final String? role;
  final VoidCallback onChanged;

  Future<void> _decide(BuildContext context, WidgetRef ref, String decision, {String? reason}) async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      await dio.post('/quotes/${quote['id']}/decide', data: {'decision': decision, 'reason': reason ?? ''});
      onChanged();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final stage = quote['stage'] as String? ?? 'pending_ops';
    final meta = quoteStatusMeta(stage);
    final items = (quote['items'] as List?) ?? [];
    final canDecide = (stage == 'pending_ops' && (role == 'operations_manager' || role == 'admin')) ||
        (stage == 'pending_finance' && (role == 'finance' || role == 'admin'));
    final opsDecision = quote['ops_decision'] as Map?;
    final financeDecision = quote['finance_decision'] as Map?;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: const Color(0xFFFFCC00).withValues(alpha: 0.27)),
          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
        ),
        padding: const EdgeInsets.all(AppMetrics.spacingMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Purchase quote (shortfall)', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800))),
                StatusBadge(label: meta.label, color: meta.color),
              ],
            ),
            Text('Items not in stock — money must leave the company.', style: text.bodySmall?.copyWith(color: AppColors.muted)),
            const SizedBox(height: AppMetrics.spacingSm),
            for (final it in items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Expanded(child: Text(it['description'] as String? ?? '', style: text.bodySmall)),
                    Text(formatMoney(((it['qty'] ?? 0) as num) * ((it['unit_cost'] ?? 0) as num), currency), style: text.bodySmall),
                  ],
                ),
              ),
            const Divider(height: AppMetrics.spacingLg, color: AppColors.border),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Quote total', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                Text(formatMoney(quote['total'] as num?, currency), style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: AppMetrics.spacingMd),
            Row(
              children: [
                Expanded(child: _ChainStep(label: 'Operations', done: opsDecision != null, name: opsDecision?['by_name'] as String?)),
                const SizedBox(width: AppMetrics.spacingSm),
                Expanded(child: _ChainStep(label: 'Finance', done: financeDecision != null, name: financeDecision?['by_name'] as String?)),
              ],
            ),
            if (stage == 'rejected') ...[
              const SizedBox(height: AppMetrics.spacingSm),
              Text('Reason: ${opsDecision?['reason'] ?? financeDecision?['reason'] ?? ''}', style: text.bodySmall?.copyWith(color: AppColors.danger)),
            ],
            if (canDecide) ...[
              const SizedBox(height: AppMetrics.spacingMd),
              Row(
                children: [
                  Expanded(child: FleetButton(label: 'Approve', onPressed: () => _decide(context, ref, 'approved'))),
                  const SizedBox(width: AppMetrics.spacingSm),
                  Expanded(
                    child: FleetButton(
                      label: 'Reject', isOutlined: true,
                      onPressed: () => _showRejectSheet(context, (reason) => _decide(context, ref, 'rejected', reason: reason)),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ChainStep extends StatelessWidget {
  const _ChainStep({required this.label, required this.done, this.name});
  final String label;
  final bool done;
  final String? name;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(AppMetrics.spacingSm),
      decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(AppMetrics.radiusSharp)),
      child: Row(
        children: [
          Container(
            width: 22, height: 22,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done ? AppColors.primary : Colors.transparent,
              border: Border.all(color: done ? AppColors.primary : AppColors.border),
            ),
            child: done ? const Icon(Icons.check, size: 14, color: AppColors.primaryInk) : null,
          ),
          const SizedBox(width: AppMetrics.spacingSm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: text.labelSmall?.copyWith(color: AppColors.muted)),
                Text(done ? (name ?? '—') : 'Pending', style: text.bodySmall?.copyWith(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PoCardMini extends StatelessWidget {
  const _PoCardMini({required this.po, required this.currency, required this.role});
  final Map<String, dynamic> po;
  final String currency;
  final String? role;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final meta = poStatusMeta(po['status'] as String? ?? 'po_issued');
    final canPay = po['status'] == 'po_issued' && (role == 'finance' || role == 'admin');
    return Padding(
      padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.27)),
          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
        ),
        padding: const EdgeInsets.all(AppMetrics.spacingMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(po['po_number'] as String? ?? '', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800))),
                StatusBadge(label: meta.label, color: meta.color),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(po['supplier'] as String? ?? 'Purchase order', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                Text(formatMoney(po['amount'] as num?, currency), style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
              ],
            ),
            if (po['status'] == 'paid')
              Text('Paid by ${po['paid_by'] ?? '—'}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
            if (canPay) ...[
              const SizedBox(height: AppMetrics.spacingSm),
              SizedBox(
                width: double.infinity,
                child: FleetButton(label: 'Mark paid + attach proof', icon: Icons.receipt_long_outlined, onPressed: () => context.push('/workshop/pos')),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ActivityTab extends StatelessWidget {
  const _ActivityTab({required this.activity});
  final List<dynamic> activity;

  static const _labels = {
    'maintenance.created': 'Job created',
    'maintenance.pending': 'Job moved to Pending',
    'maintenance.in_progress': 'Job moved to In progress',
    'maintenance.on_hold': 'Job moved to On hold',
    'maintenance.completed': 'Job completed',
    'maintenance.resumed': 'Job resumed',
    'maintenance.photo_added': 'Photo added',
    'part_requisition.submitted': 'Parts requested',
    'part_requisition.approved': 'Requisition approved',
    'part_requisition.rejected': 'Requisition rejected',
    'quote.submitted': 'Quote submitted',
    'quote.ops_approved': 'Operations approved quote',
    'quote.ops_rejected': 'Quote rejected by Operations',
    'quote.finance_approved': 'Purchase order issued',
    'quote.finance_rejected': 'Quote rejected by Finance',
  };

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (activity.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingXl),
        child: Center(child: Text('No activity yet.', style: text.bodyMedium?.copyWith(color: AppColors.muted))),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final a in activity)
          Padding(
            padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(margin: const EdgeInsets.only(top: 6), width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
                const SizedBox(width: AppMetrics.spacingSm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_labels[a['action']] ?? a['action'] as String? ?? '', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                      Text('${a['user_name'] ?? ''} · ${a['at'] ?? ''}', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _PhotosTab extends ConsumerStatefulWidget {
  const _PhotosTab({required this.job, required this.role, required this.onChanged});
  final Map<String, dynamic> job;
  final String? role;
  final VoidCallback onChanged;

  @override
  ConsumerState<_PhotosTab> createState() => _PhotosTabState();
}

class _PhotosTabState extends ConsumerState<_PhotosTab> {
  final _picker = ImagePicker();
  bool _uploading = false;

  bool get _canAdd => widget.role == 'mechanic' || widget.role == 'workshop_manager' || widget.role == 'admin';

  Future<void> _addPhoto() async {
    final XFile? file = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 60);
    if (file == null) return;
    setState(() => _uploading = true);
    try {
      final bytes = await File(file.path).readAsBytes();
      final dio = ref.read(apiClientProvider).dio;
      await dio.post('/maintenance/${widget.job['id']}/photos', data: {
        'name': file.name,
        'data': 'data:image/jpeg;base64,${base64Encode(bytes)}',
      });
      widget.onChanged();
    } catch (_) {
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final docs = (widget.job['completion_documents'] as List?) ?? [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_canAdd)
          SizedBox(
            width: double.infinity,
            child: FleetButton(label: _uploading ? 'Uploading…' : 'Add photo', icon: Icons.camera_alt_outlined, isLoading: _uploading, onPressed: _uploading ? null : _addPhoto),
          ),
        const SizedBox(height: AppMetrics.spacingMd),
        if (docs.isEmpty)
          Text(_canAdd ? '' : 'No photos on this job yet.', style: text.bodyMedium?.copyWith(color: AppColors.muted))
        else
          Wrap(
            spacing: AppMetrics.spacingSm,
            runSpacing: AppMetrics.spacingSm,
            children: [
              for (final d in docs)
                ClipRRect(
                  borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                  child: _base64Thumb(d['data'] as String?),
                ),
            ],
          ),
      ],
    );
  }

  Widget _base64Thumb(String? dataUrl) {
    if (dataUrl == null || !dataUrl.contains(',')) {
      return Container(width: 104, height: 104, color: AppColors.surfaceElevated);
    }
    try {
      final bytes = base64Decode(dataUrl.split(',').last);
      return Image.memory(bytes, width: 104, height: 104, fit: BoxFit.cover);
    } catch (_) {
      return Container(width: 104, height: 104, color: AppColors.surfaceElevated);
    }
  }
}
