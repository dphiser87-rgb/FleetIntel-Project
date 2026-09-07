import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card, Badge, Overline, EmptyState } from "../../components/ui";
import { colors, spacing } from "../../lib/theme";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { getCachedJobs, getCachedRequisitions, runSync } from "../../lib/sync";

const REQUISITION_APPROVER_ROLES = ["workshop_head", "admin"];
const OPS_ROLES = ["operations_manager", "admin"];
const FINANCE_ROLES = ["finance", "admin"];

const money = (n) => `R${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function ApprovalsListScreen({ navigation }) {
  const { user } = useAuth();
  const [requisitions, setRequisitions] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const canSeeRequisitions = REQUISITION_APPROVER_ROLES.includes(user?.role);
  const canSeeOpsQuotes = OPS_ROLES.includes(user?.role);
  const canSeeFinanceQuotes = FINANCE_ROLES.includes(user?.role);
  const wantedStages = [canSeeOpsQuotes && "pending_ops", canSeeFinanceQuotes && "pending_finance"].filter(Boolean);

  const load = useCallback(async () => {
    const jobs = await getCachedJobs();
    const jobById = Object.fromEntries(jobs.map((j) => [j.id, j]));

    if (canSeeRequisitions) {
      const all = await getCachedRequisitions();
      const pending = all
        .filter((r) => r.status === "pending_approval")
        .map((r) => ({ ...r, job_title: jobById[r.maintenance_id]?.title || "—" }));
      setRequisitions(pending);
    } else {
      setRequisitions([]);
    }

    if (wantedStages.length > 0) {
      // No workspace-wide quotes endpoint -- mirror the web app's Maintenance.jsx quotesByJob N+1
      // fetch pattern over the jobs already cached for this workspace.
      const results = await Promise.all(
        jobs.map((j) => api.get(`/maintenance/${j.id}/quotes`).then((r) => r.data?.[0]).catch(() => null))
      );
      const pending = results
        .filter((q) => q && wantedStages.includes(q.stage))
        .map((q) => ({ ...q, job_title: jobById[q.maintenance_id]?.title || "—" }));
      setQuotes(pending);
    } else {
      setQuotes([]);
    }
    setLoading(false);
  }, [canSeeRequisitions, wantedStages.join(",")]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await runSync();
    await load();
    setRefreshing(false);
  };

  const rows = [
    ...requisitions.map((r) => ({ kind: "requisition", key: `r-${r.id}`, data: r })),
    ...quotes.map((q) => ({ kind: "quote", key: `q-${q.id}`, data: q })),
  ];

  return (
    <Screen>
      <View style={styles.header}>
        <Overline>Pending your decision</Overline>
        <Text style={styles.title}>Approvals</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={!loading && <EmptyState text="Nothing awaiting your approval." />}
        renderItem={({ item }) => {
          if (item.kind === "requisition") {
            const r = item.data;
            const total = (r.items || []).reduce((s, it) => s + (Number(it.qty_requested) || 0) * (Number(it.unit_cost) || 0), 0);
            return (
              <Card style={styles.row} onPress={() => navigation.navigate("RequisitionApproval", { requisition: r })}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.job_title}</Text>
                  <Badge label="Parts" tone="warning" />
                </View>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {(r.items || []).map((it) => `${it.qty_requested}× ${it.part_name}`).join(", ")}
                </Text>
                <View style={styles.rowFooter}>
                  <Text style={styles.rowSub}>Requested by {r.requested_by_name}</Text>
                  <Text style={styles.rowValue}>{money(total)}</Text>
                </View>
              </Card>
            );
          }
          const q = item.data;
          return (
            <Card style={styles.row} onPress={() => navigation.navigate("QuoteApproval", { quote: q })}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle} numberOfLines={1}>{q.job_title}</Text>
                <Badge label={q.stage === "pending_ops" ? "Ops costing" : "Finance costing"} tone="warning" />
              </View>
              <Text style={styles.rowMeta}>Submitted by {q.submitted_by_name}</Text>
              <View style={styles.rowFooter}>
                <Text style={styles.rowSub}>{(q.items || []).length} line item(s)</Text>
                <Text style={styles.rowValue}>{money(q.total)}</Text>
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, paddingTop: spacing.xxl },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginTop: 2 },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  row: { marginBottom: spacing.sm },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs, gap: spacing.sm },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.xs },
  rowFooter: { flexDirection: "row", justifyContent: "space-between" },
  rowSub: { color: colors.textMuted, fontSize: 12 },
  rowValue: { color: colors.text, fontSize: 12, fontFamily: "monospace" },
});
