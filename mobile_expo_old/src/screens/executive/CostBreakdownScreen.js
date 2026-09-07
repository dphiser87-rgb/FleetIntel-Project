import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Screen, Card, Overline, EmptyState } from "../../components/ui";
import { colors, spacing } from "../../lib/theme";

const money = (n) => `R${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const CATEGORY_LABEL = { maintenance: "Service & repair history", fuel: "Fuel purchases", downtime: "Downtime-linked jobs" };

export default function CostBreakdownScreen({ route, navigation }) {
  const { category, maintenance = [], fuelLogs = [], label } = route.params;
  const isFuel = category === "fuel";
  const isDowntime = category === "downtime";
  const rows = isFuel ? fuelLogs : isDowntime ? maintenance.filter((m) => (m.downtime_hours || 0) > 0) : maintenance;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Overline>{CATEGORY_LABEL[category] || "Cost breakdown"}</Overline>
        <Text style={styles.title}>{label}</Text>
        {isDowntime && (
          <Text style={styles.note}>
            Downtime = time from when work started (or the job was booked in) until it was marked
            completed — real elapsed hours, not an estimate.
          </Text>
        )}
        {rows.map((r) => (
          <TouchableOpacity
            key={r.id}
            onPress={() => navigation.navigate("TransactionDetail", {
              event: isFuel
                ? { type: "fuel", meta: { id: r.id }, title: `Fuel · ${(r.occurred_at || "").slice(0, 10)}` }
                : { type: "maintenance", meta: { id: r.id }, title: r.title },
            })}
          >
            <Card style={styles.row}>
              <Text style={styles.rowTitle} numberOfLines={1}>{isFuel ? (r.occurred_at || "").slice(0, 10) : r.title}</Text>
              {!isFuel && <Text style={styles.rowMeta}>{r.status?.toUpperCase()}</Text>}
              <View style={styles.rowFooter}>
                <Text style={styles.rowSub}>{isFuel ? `${r.litres} L` : `${r.downtime_hours || 0} h`}</Text>
                <Text style={styles.rowValue}>{money(isFuel ? r.cost : (r.actual_cost || r.estimated_cost))}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        ))}
        {rows.length === 0 && <EmptyState text="No records in this category." />}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 2, marginBottom: spacing.sm },
  note: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.md },
  row: { marginBottom: spacing.sm },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.textMuted, fontSize: 10, textTransform: "uppercase", marginTop: 2 },
  rowFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  rowSub: { color: colors.textMuted, fontSize: 12, fontFamily: "monospace" },
  rowValue: { color: colors.text, fontSize: 12, fontFamily: "monospace" },
});
