import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_state.dart';
import 'outbox_repository.dart';

class SyncStatus {
  const SyncStatus({this.pendingCount = 0, this.authExpired = false});

  final int pendingCount;
  final bool authExpired;

  SyncStatus copyWith({int? pendingCount, bool? authExpired}) =>
      SyncStatus(pendingCount: pendingCount ?? this.pendingCount, authExpired: authExpired ?? this.authExpired);
}

/// Mirrors the Expo prototype's PendingSyncBadge pattern (mobile_expo_old/src/components/
/// PendingSyncBadge.js): tracks how many outbox entries are waiting, flushes automatically when
/// connectivity comes back, and surfaces a distinct "sign in again to sync" state rather than a
/// plain count when a stale refresh token is blocking the flush.
class SyncStatusController extends StateNotifier<SyncStatus> {
  SyncStatusController(this._ref) : super(const SyncStatus()) {
    _refreshCount();
    _connectivitySub = Connectivity().onConnectivityChanged.listen((results) {
      if (!results.contains(ConnectivityResult.none)) flush();
    });
  }

  final Ref _ref;
  late final StreamSubscription<List<ConnectivityResult>> _connectivitySub;

  Future<void> _refreshCount() async {
    final count = await _ref.read(outboxRepositoryProvider).pendingCount();
    state = state.copyWith(pendingCount: count);
  }

  Future<void> flush() async {
    final outcome = await _ref.read(outboxRepositoryProvider).flush();
    await _refreshCount();
    state = state.copyWith(authExpired: outcome == FlushOutcome.authExpired);
  }

  @override
  void dispose() {
    _connectivitySub.cancel();
    super.dispose();
  }
}

final syncStatusProvider = StateNotifierProvider<SyncStatusController, SyncStatus>((ref) {
  return SyncStatusController(ref);
});
