import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/app_theme.dart';
import 'sync_status.dart';

class PendingSyncBadge extends ConsumerWidget {
  const PendingSyncBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(syncStatusProvider);
    if (status.pendingCount == 0) return const SizedBox.shrink();

    return OutlinedButton(
      onPressed: () => ref.read(syncStatusProvider.notifier).flush(),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: status.authExpired ? AppColors.primary : AppColors.border),
        foregroundColor: status.authExpired ? AppColors.primary : AppColors.muted,
      ),
      child: Text(
        status.authExpired
            ? 'Sign in to sync ${status.pendingCount}'
            : '${status.pendingCount} pending sync',
        style: const TextStyle(fontSize: 11, letterSpacing: 1, fontWeight: FontWeight.w700),
      ),
    );
  }
}
