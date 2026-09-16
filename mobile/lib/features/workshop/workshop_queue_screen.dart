import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import 'workshop_ui.dart';

/// Mobile port of the reference's workshop/queue.tsx ("My Queue") -- purely a renderer over the
/// server-computed /workshop/queue response; no client-side role branching.
class WorkshopQueueScreen extends ConsumerStatefulWidget {
  const WorkshopQueueScreen({super.key});

  @override
  ConsumerState<WorkshopQueueScreen> createState() => _WorkshopQueueScreenState();
}

class _WorkshopQueueScreenState extends ConsumerState<WorkshopQueueScreen> {
  bool _loading = true;
  List<dynamic> _items = [];
  String _currency = 'USD';
  String _role = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([dio.get('/workshop/queue'), dio.get('/workspace')]);
      final data = results[0].data as Map<String, dynamic>;
      setState(() {
        _items = data['items'] as List;
        _role = data['role'] as String? ?? '';
        _currency = ((results[1].data as Map<String, dynamic>)['workspace'] as Map<String, dynamic>?)?['currency'] as String? ?? 'USD';
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  ({Color color, IconData icon}) _meta(String type) {
    switch (type) {
      case 'quote':
        return (color: const Color(0xFFA855F7), icon: Icons.paid_outlined);
      case 'po':
        return (color: const Color(0xFF3B82F6), icon: Icons.receipt_long_outlined);
      default:
        return (color: const Color(0xFFFFCC00), icon: Icons.assignment_outlined);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: Column(
          children: [
            const Text('My queue'),
            Text('Waiting on $_role', style: text.bodySmall?.copyWith(color: AppColors.muted)),
          ],
        ),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _items.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.check_circle_outline, size: 40, color: AppColors.primary),
                        const SizedBox(height: AppMetrics.spacingSm),
                        Text("You're all caught up.", style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text('Nothing is waiting on you right now.', style: text.bodySmall?.copyWith(color: AppColors.muted)),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: AppMetrics.spacingLg, vertical: AppMetrics.spacingMd),
                      itemCount: _items.length,
                      itemBuilder: (context, i) {
                        final it = _items[i] as Map<String, dynamic>;
                        final meta = _meta(it['type'] as String? ?? 'requisition');
                        return InkWell(
                          onTap: () {
                            if (it['route'] == 'pos') {
                              context.push('/workshop/pos');
                            } else if (it['job_id'] != null) {
                              context.push('/workshop/job/${it['job_id']}');
                            }
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: AppMetrics.spacingSm),
                            child: Row(
                              children: [
                                Container(
                                  width: 38, height: 38,
                                  decoration: BoxDecoration(color: meta.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(AppMetrics.radiusSharp)),
                                  child: Icon(meta.icon, color: meta.color, size: 18),
                                ),
                                const SizedBox(width: AppMetrics.spacingSm),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(it['label'] as String? ?? '', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                                      if (it['job_title'] != null) Text(it['job_title'] as String, style: text.bodySmall?.copyWith(color: AppColors.muted)),
                                      if (it['subtitle'] != null) Text(it['subtitle'] as String, style: text.bodySmall?.copyWith(color: AppColors.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    if (it['amount'] != null) Text(formatMoney(it['amount'] as num?, _currency), style: text.bodySmall?.copyWith(fontWeight: FontWeight.w700)),
                                    const Icon(Icons.chevron_right, size: 18, color: AppColors.muted),
                                  ],
                                ),
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
}
