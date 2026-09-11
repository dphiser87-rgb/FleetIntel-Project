import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/status_chip.dart';

/// Ported from the Fleet Hub reference app's history.tsx -- a driver's own inspection history
/// (GET /inspections is now driver-scoped server-side for role=driver), pull-to-refresh, empty
/// state, tap through to the detail screen.
class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      final response = await dio.get('/inspections');
      final rows = (response.data as List).map((e) => Map<String, dynamic>.from(e)).toList();
      setState(() {
        _items = rows;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  String _overallStatus(Map<String, dynamic> insp) => (insp['fail_count'] as num? ?? 0) > 0 ? 'critical' : 'pass';

  String _fmtDate(dynamic iso) {
    if (iso == null) return '';
    try {
      return DateFormat('d MMM, HH:mm').format(DateTime.parse(iso as String).toLocal());
    } catch (_) {
      return iso.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Inspection History')),
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? ListView(
                    children: [
                      const SizedBox(height: AppMetrics.spacingXl),
                      Center(child: Text("Couldn't load history.", style: text.bodyMedium?.copyWith(color: AppColors.muted))),
                    ],
                  )
                : _items.isEmpty
                    ? ListView(
                        children: [
                          const SizedBox(height: AppMetrics.spacingXl * 2),
                          Icon(Icons.assignment_outlined, size: 48, color: AppColors.muted.withValues(alpha: 0.5)),
                          const SizedBox(height: AppMetrics.spacingMd),
                          Center(child: Text('No inspections yet', style: text.titleMedium)),
                          const SizedBox(height: AppMetrics.spacingXs),
                          Center(
                            child: Text('Completed inspections will appear here.',
                                style: text.bodySmall?.copyWith(color: AppColors.muted)),
                          ),
                        ],
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppMetrics.spacingLg),
                        itemCount: _items.length,
                        separatorBuilder: (context, index) => const SizedBox(height: AppMetrics.spacingMd),
                        itemBuilder: (context, index) {
                          final insp = _items[index];
                          final failCount = (insp['fail_count'] as num? ?? 0).toInt();
                          return GestureDetector(
                            onTap: () => context.push('/history/${insp['id']}'),
                            child: Container(
                              padding: const EdgeInsets.all(AppMetrics.spacingLg),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceElevated,
                                border: Border.all(color: AppColors.border),
                                borderRadius: BorderRadius.circular(AppMetrics.radiusMedium),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          (insp['template_name'] as String?) ?? 'Inspection',
                                          style: text.titleMedium,
                                        ),
                                      ),
                                      StatusChip(status: _overallStatus(insp)),
                                    ],
                                  ),
                                  const SizedBox(height: AppMetrics.spacingXs),
                                  Text(
                                    '${insp['target_plate'] ?? insp['target_name'] ?? ''} · ${((insp['odometer'] as num?) ?? 0).toInt()} km',
                                    style: text.bodySmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600),
                                  ),
                                  const SizedBox(height: AppMetrics.spacingSm),
                                  Container(
                                    padding: const EdgeInsets.only(top: AppMetrics.spacingSm),
                                    decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(_fmtDate(insp['created_at']), style: text.bodySmall?.copyWith(color: AppColors.muted)),
                                        Text(
                                          '$failCount defect${failCount == 1 ? '' : 's'}',
                                          style: text.bodySmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w700),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
