import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_state.dart';
import 'outbox_repository.dart';

class SyncStatus {
  const SyncStatus({
    this.pendingCount = 0,
    this.failedCount = 0,
    this.authExpired = false,
    this.accountHold = false,
  });

  /// Waiting to sync, and expected to succeed eventually.
  final int pendingCount;

  /// Rejected by the server in a way retrying won't fix. Counted separately so the work is visible
  /// instead of silently disappearing, which is what happened before these entries were retained.
  final int failedCount;

  final bool authExpired;

  /// The account is on a billing or security hold: uploads are refused until it clears. Nothing is
  /// lost, and the queue flushes once the account is reactivated.
  final bool accountHold;

  SyncStatus copyWith({int? pendingCount, int? failedCount, bool? authExpired, bool? accountHold}) =>
      SyncStatus(
        pendingCount: pendingCount ?? this.pendingCount,
        failedCount: failedCount ?? this.failedCount,
        authExpired: authExpired ?? this.authExpired,
        accountHold: accountHold ?? this.accountHold,
      );
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
    final repo = _ref.read(outboxRepositoryProvider);
    final pending = await repo.pendingCount();
    final failed = await repo.failedCount();
    state = state.copyWith(pendingCount: pending, failedCount: failed);
  }

  Future<void> flush() async {
    final outcome = await _ref.read(outboxRepositoryProvider).flush();
    await _refreshCount();
    state = state.copyWith(
      authExpired: outcome == FlushOutcome.authExpired,
      // Cleared on any flush that isn't refused for a hold, so reactivation resolves it without
      // needing the app restarted.
      accountHold: outcome == FlushOutcome.accountHold,
    );
  }

  /// Requeue a rejected entry once whatever blocked it has been resolved.
  Future<void> retryFailed(String id) async {
    await _ref.read(outboxRepositoryProvider).retryFailed(id);
    await _refreshCount();
  }

  Future<void> discardFailed(String id) async {
    await _ref.read(outboxRepositoryProvider).discardFailed(id);
    await _refreshCount();
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
