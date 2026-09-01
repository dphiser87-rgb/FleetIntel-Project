import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card, Badge, Overline, EmptyState } from "../components/ui";
import PendingSyncBadge from "../components/PendingSyncBadge";
import { colors, spacing } from "../lib/theme";
import { getCachedJobs, getCachedVehicles, getCachedRequisitions, runSync } from "../lib/sync";

const STATUS_TONE = { pending: "muted", in_progress: "primary", completed: "success", cancelled: "danger", on_hold: "warning" };
const PARTS_BADGE = {
  pending_approval: { label: "Awaiting parts", tone: "warning" },
  approved: { label: "Parts approved", tone: "success" },
  rejected: { label: "Parts rejected", tone: "danger" },
};

export default function JobsScreen({ navigation }) {
  const [jobs, setJobs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [cached, vehicles, requisitions] = await Promise.all([getCachedJobs(), getCachedVehicles(), getCachedRequisitions()]);
    // GET /maintenance's list response only enriches asset-linked jobs with a name -- vehicle-linked
    // jobs carry just vehicle_id, so resolve the display name against the cached vehicle list here.
    const vmap = Object.fromEntries(vehicles.map((v) => [v.id, v]));
    // Keyed by each job's MOST RECENT requisition (not just pending ones), so an approved/rejected
    // request still shows a status on the card instead of silently reverting to a plain one.
    const sortedReqs = [...requisitions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const partsStatusByJob = {};
    for (const r of sortedReqs) {
      if (!(r.maintenance_id in partsStatusByJob)) partsStatusByJob[r.maintenance_id] = r.status;
    }
    const withNames = cached.map((j) => ({
      ...j,
      display_name: j.asset_name || (j.vehicle_id && vmap[j.vehicle_id]?.name) || "—",
      parts_status: partsStatusByJob[j.id],
    }));
    // Open jobs first, newest first within each group -- a mechanic cares about what's still due.
    withNames.sort((a, b) => {
      if ((a.status === "completed") !== (b.status === "completed")) return a.status === "completed" ? 1 : -1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    setJobs(withNames);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await runSync();
    await load();
    setRefreshing(false);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Overline>Assigned to me</Overline>
          <Text style={styles.title}>My Jobs</Text>
        </View>
        <PendingSyncBadge />
      </View>
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState text="No jobs assigned to you yet." />}
        renderItem={({ item }) => (
          <Card style={styles.jobCard} onPress={() => navigation.navigate("JobDetail", { jobId: item.id })}>
            <View style={styles.jobHeader}>
              <Text style={styles.jobTitle} numberOfLines={1}>{item.title}</Text>
              <View style={styles.badgeGroup}>
                {item.status !== "completed" && PARTS_BADGE[item.parts_status] && (
                  <Badge label={PARTS_BADGE[item.parts_status].label} tone={PARTS_BADGE[item.parts_status].tone} />
                )}
                <Badge label={item.status.replace("_", " ")} tone={STATUS_TONE[item.status] || "muted"} />
              </View>
            </View>
            <Text style={styles.jobMeta}>{item.display_name} · {item.priority}</Text>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    padding: spacing.lg, paddingTop: spacing.xxl,
  },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginTop: 2 },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  jobCard: { marginBottom: spacing.sm },
  jobHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  badgeGroup: { flexDirection: "row", gap: spacing.xs },
  jobTitle: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1, marginRight: spacing.sm },
  jobMeta: { color: colors.textMuted, fontSize: 12 },
});
