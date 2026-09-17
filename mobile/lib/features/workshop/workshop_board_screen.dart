import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/fleet_button.dart';
import '../../core/widgets/fleet_card.dart';
import '../../core/widgets/status_badge.dart';
import 'workshop_finance_board_view.dart';
import 'workshop_ui.dart';

const _kColumns = [
  ('pending', 'Pending'),
  ('in_progress', 'In progress'),
  ('on_hold', 'On hold'),
  ('completed', 'Completed'),
];

/// Workshop job board -- mobile port of the FleetHub-Workshop reference's workshop/index.tsx, wired
/// to our real /maintenance + /workshop/queue endpoints instead of its Mongo collections. Board view
/// only for this pass (the reference's Table/Audit view toggle is a later refinement, not required
/// for the core workflow to be usable).
class WorkshopBoardScreen extends ConsumerStatefulWidget {
  const WorkshopBoardScreen({super.key});

  @override
  ConsumerState<WorkshopBoardScreen> createState() => _WorkshopBoardScreenState();
}

class _WorkshopBoardScreenState extends ConsumerState<WorkshopBoardScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _jobs = [];
  Map<String, dynamic> _vehicleMap = {};
  int _queueCount = 0;
  String _filter = 'all';
  String _currency = 'USD';

  @override
  void initState() {
    super.initState();
    // Finance renders WorkshopFinanceBoardView instead (see build()), which does its own loading --
    // skip fetching job-board data it'll never display.
    if (ref.read(authControllerProvider).user?['role'] != 'finance') _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([
        dio.get('/maintenance'),
        dio.get('/vehicles'),
        dio.get('/workshop/queue'),
        dio.get('/workspace'),
      ]);
      final vehicles = (results[1].data as List).cast<Map<String, dynamic>>();
      setState(() {
        _jobs = results[0].data as List;
        _vehicleMap = {for (final v in vehicles) v['id'].toString(): v};
        _queueCount = (results[2].data as Map<String, dynamic>)['count'] as int? ?? 0;
        _currency = ((results[3].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Could not load the workshop board.';
        _loading = false;
      });
    }
  }

  bool get _canCreate {
    final role = ref.read(authControllerProvider).user?['role'] as String?;
    return role == 'mechanic' || role == 'workshop_head' || role == 'admin';
  }

  @override
  Widget build(BuildContext context) {
    final userName = ref.watch(authControllerProvider).user?['name'] as String?;
    final role = ref.watch(authControllerProvider).user?['role'] as String? ?? '';
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    final visible = _filter == 'all' ? _jobs : _jobs.where((j) => j['status'] == _filter).toList();

    // Finance's job is reviewing the financial workflow workshop activity generates (quotes needing a
    // decision, POs awaiting payment) -- not tracking job status the way mechanics/workshop_head do,
    // so it gets a dedicated view instead of this board with a relabeled subtitle. Every other role's
    // board is unchanged.
    if (role == 'finance') {
      return const Scaffold(body: WorkshopFinanceBoardView());
    }

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppMetrics.spacingLg, AppMetrics.spacingMd, AppMetrics.spacingLg, AppMetrics.spacingSm,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Workshop', style: text.displayLarge?.copyWith(fontSize: 28)),
                        if (userName != null)
                          Text(role, style: text.labelMedium?.copyWith(color: colors.primary, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.logout_outlined, color: AppColors.muted),
                    tooltip: 'Log out',
                    onPressed: () async {
                      await ref.read(authControllerProvider.notifier).logout();
                      if (context.mounted) context.go('/login');
                    },
                  ),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? Center(child: Text(_error!, style: text.bodyMedium?.copyWith(color: AppColors.muted)))
                        : ListView(
                            padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg),
                            children: [
                              Row(
                                children: [
                                  Expanded(child: _ActionTile(icon: Icons.inbox_outlined, label: 'My queue', badge: _queueCount, onTap: () => context.push('/workshop/queue'))),
                                  const SizedBox(width: AppMetrics.spacingSm),
                                  Expanded(child: _ActionTile(icon: Icons.receipt_long_outlined, label: 'Purchase orders', onTap: () => context.push('/workshop/pos'))),
                                  const SizedBox(width: AppMetrics.spacingSm),
                                  Expanded(child: _ActionTile(icon: Icons.bar_chart_outlined, label: 'Cost rollup', onTap: () => context.push('/workshop/cost-rollup'))),
                                ],
                              ),
                              const SizedBox(height: AppMetrics.spacingMd),
                              SizedBox(
                                height: 40,
                                child: ListView(
                                  scrollDirection: Axis.horizontal,
                                  children: [
                                    _FilterChip(label: 'All', count: _jobs.length, active: _filter == 'all', onTap: () => setState(() => _filter = 'all')),
                                    for (final c in _kColumns)
                                      _FilterChip(
                                        label: c.$2,
                                        count: _jobs.where((j) => j['status'] == c.$1).length,
                                        active: _filter == c.$1,
                                        onTap: () => setState(() => _filter = c.$1),
                                      ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: AppMetrics.spacingMd),
                              if (visible.isEmpty)
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingXl),
                                  child: Center(child: Text('No jobs in this lane.', style: text.bodyMedium?.copyWith(color: AppColors.muted))),
                                )
                              else
                                for (final job in visible) _JobCard(job: job, vehicle: _vehicleMap[job['vehicle_id']?.toString()], currency: _currency),
                              const SizedBox(height: AppMetrics.spacingXl * 2),
                            ],
                          ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: _canCreate
          ? FloatingActionButton(
              backgroundColor: colors.primary,
              onPressed: () => _showCreateJobSheet(context),
              child: const Icon(Icons.add, color: AppColors.primaryInk),
            )
          : null,
    );
  }

  void _showCreateJobSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surfaceElevated,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(AppMetrics.radiusLarge))),
      builder: (_) => _CreateJobSheet(onCreated: _load),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.icon, required this.label, required this.onTap, this.badge});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return FleetCard(
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: colors.primary, size: AppMetrics.iconMd),
              const SizedBox(height: AppMetrics.spacingSm),
              Text(label, style: text.labelMedium, maxLines: 2),
            ],
          ),
          if (badge != null && badge! > 0)
            Positioned(
              top: -6, right: -6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: AppColors.danger, borderRadius: BorderRadius.circular(999)),
                child: Text(badge! > 9 ? '9+' : '$badge', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
              ),
            ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.count, required this.active, required this.onTap});
  final String label;
  final int count;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(right: AppMetrics.spacingSm),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: AppMetrics.spacingSm),
          decoration: BoxDecoration(
            color: active ? colors.primary : AppColors.surface,
            border: Border.all(color: active ? colors.primary : AppColors.border),
            borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
          ),
          alignment: Alignment.center,
          child: Text(
            count > 0 ? '$label · $count' : label,
            style: text.labelMedium?.copyWith(color: active ? AppColors.primaryInk : AppColors.ink, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job, this.vehicle, required this.currency});
  final Map<String, dynamic> job;
  final Map<String, dynamic>? vehicle;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final status = job['status'] as String? ?? 'pending';
    final priority = job['priority'] as String? ?? 'medium';
    final vehicleLabel = vehicle != null ? '${vehicle!['name'] ?? ''} · ${vehicle!['type'] ?? ''}' : '—';
    return Padding(
      padding: const EdgeInsets.only(bottom: AppMetrics.spacingMd),
      child: FleetCard(
        onTap: () => context.push('/workshop/job/${job['id']}'),
        child: Column(
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
            Text(job['title'] as String? ?? '', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Row(
              children: [
                const Icon(Icons.local_shipping_outlined, size: 14, color: AppColors.muted),
                const SizedBox(width: 4),
                Text(vehicleLabel, style: text.bodySmall?.copyWith(color: AppColors.muted)),
              ],
            ),
            const Divider(height: AppMetrics.spacingLg, color: AppColors.border),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('PARTS COST', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
                Text(formatMoney(job['parts_cost'] as num?, currency), style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateJobSheet extends ConsumerStatefulWidget {
  const _CreateJobSheet({required this.onCreated});
  final VoidCallback onCreated;

  @override
  ConsumerState<_CreateJobSheet> createState() => _CreateJobSheetState();
}

class _CreateJobSheetState extends ConsumerState<_CreateJobSheet> {
  final _titleController = TextEditingController();
  String _priority = 'medium';
  String? _vehicleId;
  List<dynamic> _vehicles = [];
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadVehicles();
  }

  Future<void> _loadVehicles() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final response = await dio.get('/vehicles');
      final list = response.data as List;
      setState(() {
        _vehicles = list;
        if (list.isNotEmpty) _vehicleId = list.first['id'].toString();
      });
    } catch (_) {}
  }

  Future<void> _submit() async {
    if (_titleController.text.trim().isEmpty || _vehicleId == null || _submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider).dio;
      final vehicle = _vehicles.firstWhere((v) => v['id'].toString() == _vehicleId);
      await dio.post('/maintenance', data: {
        'title': _titleController.text.trim(),
        'vehicle_id': _vehicleId,
        'priority': _priority,
        'odometer': (vehicle['odometer'] as num?)?.toInt() ?? 0,
      });
      if (mounted) {
        Navigator.of(context).pop();
        widget.onCreated();
      }
    } catch (_) {
      setState(() => _error = 'Could not create job. Check details.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = Theme.of(context).colorScheme;
    return Padding(
      padding: EdgeInsets.only(
        left: AppMetrics.spacingLg, right: AppMetrics.spacingLg, top: AppMetrics.spacingLg,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppMetrics.spacingLg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('New job', style: text.headlineSmall),
          const SizedBox(height: AppMetrics.spacingMd),
          TextField(controller: _titleController, decoration: const InputDecoration(hintText: 'e.g. Front brake pads worn')),
          const SizedBox(height: AppMetrics.spacingMd),
          Text('PRIORITY', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
          const SizedBox(height: AppMetrics.spacingSm),
          Row(
            children: [
              for (final p in const ['low', 'medium', 'high', 'critical'])
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(right: AppMetrics.spacingXs),
                    child: GestureDetector(
                      onTap: () => setState(() => _priority = p),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingSm),
                        decoration: BoxDecoration(
                          color: _priority == p ? colors.primary : AppColors.surface,
                          border: Border.all(color: _priority == p ? colors.primary : AppColors.border),
                          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                        ),
                        alignment: Alignment.center,
                        child: Text(p[0].toUpperCase() + p.substring(1), style: text.labelSmall?.copyWith(color: _priority == p ? AppColors.primaryInk : AppColors.ink)),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppMetrics.spacingMd),
          Text('VEHICLE', style: text.labelSmall?.copyWith(color: AppColors.muted, letterSpacing: 1)),
          const SizedBox(height: AppMetrics.spacingSm),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final v in _vehicles)
                  Padding(
                    padding: const EdgeInsets.only(right: AppMetrics.spacingSm),
                    child: GestureDetector(
                      onTap: () => setState(() => _vehicleId = v['id'].toString()),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingMd, vertical: AppMetrics.spacingSm),
                        decoration: BoxDecoration(
                          color: _vehicleId == v['id'].toString() ? colors.primary : AppColors.surface,
                          border: Border.all(color: _vehicleId == v['id'].toString() ? colors.primary : AppColors.border),
                          borderRadius: BorderRadius.circular(AppMetrics.radiusSharp),
                        ),
                        alignment: Alignment.center,
                        child: Text(v['name'] as String? ?? '', style: text.labelSmall?.copyWith(color: _vehicleId == v['id'].toString() ? AppColors.primaryInk : AppColors.ink)),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppMetrics.spacingSm),
            Text(_error!, style: text.bodySmall?.copyWith(color: AppColors.danger)),
          ],
          const SizedBox(height: AppMetrics.spacingLg),
          SizedBox(
            width: double.infinity,
            child: FleetButton(
              label: 'Create job',
              isLoading: _submitting,
              onPressed: _titleController.text.trim().isEmpty ? null : _submit,
            ),
          ),
        ],
      ),
    );
  }
}
