import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../lib/theme";
import { getQueuedCount, subscribeQueueChanged } from "../lib/offlineQueue";
import { getLastSyncResult, runSync } from "../lib/sync";

export default function PendingSyncBadge() {
  const [count, setCount] = useState(0);
  const [authExpired, setAuthExpired] = useState(false);

  const refresh = () => {
    getQueuedCount().then(setCount);
    setAuthExpired(getLastSyncResult().authExpired);
  };

  useEffect(() => {
    refresh();
    return subscribeQueueChanged(refresh);
  }, []);

  if (count === 0) return null;

  return (
    <TouchableOpacity
      style={[styles.badge, authExpired && styles.badgeWarn]}
      onPress={() => runSync().then(refresh)}
    >
      <Text style={[styles.text, authExpired && styles.textWarn]}>
        {authExpired ? `Sign in to sync ${count}` : `${count} pending sync`}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6 },
  badgeWarn: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
  text: { fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: colors.textMuted },
  textWarn: { color: colors.primary },
});
