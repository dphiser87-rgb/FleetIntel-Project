import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { Screen, Card, Badge, Overline } from "../../components/ui";
import { colors, spacing } from "../../lib/theme";
import { api } from "../../lib/api";

const KPI_TILES = [
  { key: "maintenance", label: "Total Fleet Maintenance Spend" },
  { key: "tyres", label: "Total Tyre Spend" },
  { key: "parts", label: "Total Spare Parts Spend" },
  { key: "cost_per_vehicle", label: "Fleet Cost per Vehicle / Month" },
];

const INSIGHT_TONE = { warning: "primary", alert: "danger", info: "warning", success: "success" };
const PIE_COLORS = [colors.primary, colors.success, colors.warning];

const money = (n) => `R${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function ExecutiveDashboardScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/analytics/executive-dashboard");
      setData(d);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!data) return <Screen style={styles.centered}><Text style={styles.muted}>Loading…</Text></Screen>;

  const barData = data.monthly_trend.map((m) => ({ value: m.total, label: m.month.slice(5) }));
  const pieData = data.ytd_breakdown
    .filter((b) => b.value > 0)
    .map((b, i) => ({ value: b.value, color: PIE_COLORS[i % PIE_COLORS.length], text: `${b.pct}%` }));

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Overline>Command center</Overline>
        <Text style={styles.title}>Executive Dashboard</Text>

        <View style={styles.tileGrid}>
          {KPI_TILES.map((t) => {
            const k = data.kpis[t.key];
            const up = k.delta_pct > 0;
            return (
              <Card key={t.key} style={styles.tile}>
                <Overline>{t.label}</Overline>
                <Text style={styles.tileValue}>{money(k.value)}</Text>
                {k.delta_pct !== 0 && (
                  <Text style={[styles.delta, up ? styles.deltaUp : styles.deltaDown]}>
                    {up ? "+" : ""}{k.delta_pct}% vs last month
                  </Text>
                )}
              </Card>
            );
          })}
        </View>

        {data.insights.length > 0 && (
          <Card style={styles.card}>
            <Overline>Cost intelligence insights</Overline>
            {data.insights.map((ins) => (
              <View key={ins.id} style={styles.insightRow}>
                <View style={styles.insightHeader}>
                  <Text style={styles.insightTitle}>{ins.title}</Text>
                  <Badge label={ins.priority} tone={INSIGHT_TONE[ins.type] || "muted"} />
                </View>
                <Text style={styles.insightMsg}>{ins.message}</Text>
                {!!ins.impact && <Text style={styles.insightImpact}>{ins.impact}</Text>}
              </View>
            ))}
          </Card>
        )}

        <Card style={styles.card}>
          <Overline>Monthly spend (6mo)</Overline>
          <BarChart
            data={barData}
            width={280}
            height={160}
            barWidth={22}
            spacing={14}
            frontColor={colors.primary}
            yAxisTextStyle={{ color: colors.textMuted, fontSize: 9 }}
            xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
            noOfSections={4}
            rulesColor={colors.border}
            yAxisColor={colors.border}
            xAxisColor={colors.border}
          />
        </Card>

        {pieData.length > 0 && (
          <Card style={styles.card}>
            <Overline>YTD breakdown</Overline>
            <View style={styles.pieRow}>
              <PieChart data={pieData} radius={70} showText textColor={colors.text} textSize={10} />
              <View style={styles.pieLegend}>
                {data.ytd_breakdown.filter((b) => b.value > 0).map((b, i) => (
                  <View key={b.name} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }]} />
                    <Text style={styles.legendText}>{b.name} · {money(b.value)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Card>
        )}

        <Card style={styles.card}>
          <Overline>Top vehicles by cost</Overline>
          {data.top_vehicles.map((v) => (
            <TouchableOpacity
              key={v.vehicle_id}
              style={styles.rankRow}
              onPress={() => navigation.navigate("VehicleInvestigation", { vehicleId: v.vehicle_id, label: v.name })}
            >
              <Text style={styles.rankLabel}>{v.name}</Text>
              <Text style={styles.rankValue}>{money(v.value)}</Text>
            </TouchableOpacity>
          ))}
        </Card>

        <Card style={styles.card}>
          <Overline>Cost by region</Overline>
          {data.by_region.map((r) => (
            <View key={r.region} style={styles.rankRow}>
              <Text style={styles.rankLabel}>{r.region}</Text>
              <Text style={styles.rankValue}>{money(r.value)}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Overline>Top suppliers by spend</Overline>
          {data.top_suppliers.map((s) => (
            <View key={s.supplier} style={styles.rankRow}>
              <Text style={styles.rankLabel}>{s.supplier}</Text>
              <Text style={styles.rankValue}>{money(s.value)}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  centered: { justifyContent: "center", alignItems: "center" },
  muted: { color: colors.textMuted },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginTop: 2, marginBottom: spacing.lg },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  tile: { width: "48%" },
  tileValue: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: spacing.xs },
  delta: { fontSize: 11, marginTop: 4 },
  deltaUp: { color: colors.danger },
  deltaDown: { color: colors.success },
  card: { marginBottom: spacing.md },
  insightRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  insightHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  insightTitle: { color: colors.text, fontSize: 13, fontWeight: "700", flex: 1 },
  insightMsg: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  insightImpact: { color: colors.primary, fontSize: 11, marginTop: 4, fontWeight: "600" },
  pieRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.sm },
  pieLegend: { flex: 1, gap: spacing.xs },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.textMuted, fontSize: 12 },
  rankRow: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  rankLabel: { color: colors.text, fontSize: 13 },
  rankValue: { color: colors.textMuted, fontSize: 13, fontFamily: "monospace" },
});
