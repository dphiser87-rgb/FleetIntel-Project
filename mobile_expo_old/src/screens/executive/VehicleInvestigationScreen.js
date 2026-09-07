import React, { useCallback, useState } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-gifted-charts";
import { Screen, Card, Overline, Button } from "../../components/ui";
import { colors, spacing } from "../../lib/theme";
import { api } from "../../lib/api";
import { queueSubmission } from "../../lib/offlineQueue";

const PERIODS = [
  { value: "all", label: "All" },
  { value: "12m", label: "12mo" },
  { value: "6m", label: "6mo" },
  { value: "90d", label: "90d" },
  { value: "30d", label: "30d" },
];

const money = (n) => `R${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
});

export default function VehicleInvestigationScreen({ route, navigation }) {
  const { vehicleId, label } = route.params;
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState(null);
  const [tripLogs, setTripLogs] = useState([]);
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelForm, setFuelForm] = useState({ litres: "", cost: "", location: "" });
  const [showTripForm, setShowTripForm] = useState(false);
  const [tripForm, setTripForm] = useState({ distance_km: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get(`/vehicles/${vehicleId}/investigation`, { params: { period } });
      setData(d);
    } catch {}
    try {
      const { data: t } = await api.get("/trip-logs", { params: { vehicle_id: vehicleId } });
      setTripLogs(t || []);
    } catch {}
  }, [vehicleId, period]);

  useFocusEffect(useCallback(() => { setData(null); load(); }, [load]));

  const logFuel = async () => {
    if (!fuelForm.litres || !fuelForm.cost) { Alert.alert("Litres and cost are required"); return; }
    const clientSubmissionId = uuid();
    const payload = {
      vehicle_id: vehicleId, occurred_at: new Date().toISOString(),
      litres: Number(fuelForm.litres), cost: Number(fuelForm.cost), location: fuelForm.location,
      client_submission_id: clientSubmissionId,
    };
    setSubmitting(true);
    try {
      await api.post("/fuel-logs", payload);
      setShowFuelForm(false);
      setFuelForm({ litres: "", cost: "", location: "" });
      await load();
    } catch (err) {
      if (!err?.response) {
        await queueSubmission({ id: clientSubmissionId, kind: "fuel_log", method: "POST", endpoint: "/fuel-logs", payload });
        Alert.alert("Saved offline", "This fuel entry will sync once you're back online.");
        setShowFuelForm(false);
        setFuelForm({ litres: "", cost: "", location: "" });
      } else {
        Alert.alert("Failed", err?.response?.data?.detail || "Could not log this purchase.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const logTrip = async () => {
    if (!tripForm.distance_km) { Alert.alert("Distance is required"); return; }
    const clientSubmissionId = uuid();
    const payload = { vehicle_id: vehicleId, occurred_at: new Date().toISOString(), distance_km: Number(tripForm.distance_km), client_submission_id: clientSubmissionId };
    setSubmitting(true);
    try {
      await api.post("/trip-logs", payload);
      setShowTripForm(false);
      setTripForm({ distance_km: "" });
      await load();
    } catch (err) {
      if (!err?.response) {
        await queueSubmission({ id: clientSubmissionId, kind: "trip_log", method: "POST", endpoint: "/trip-logs", payload });
        Alert.alert("Saved offline", "This trip will sync once you're back online.");
        setShowTripForm(false);
        setTripForm({ distance_km: "" });
      } else {
        Alert.alert("Failed", err?.response?.data?.detail || "Could not log this trip.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!data) return <Screen style={styles.centered}><Text style={styles.muted}>Loading vehicle investigation…</Text></Screen>;

  const { vehicle: v, driver, cost_summary: cs, monthly_trend, fuel_logs, maintenance, defects, utilization, timeline } = data;
  const lineData = (monthly_trend || []).map((m) => ({ value: m.total, label: m.month.slice(5) }));

  const costTiles = [
    ["Maintenance", cs.maintenance_cost, "maintenance", fuel_logs, maintenance],
    ["Fuel", cs.fuel_cost, "fuel", fuel_logs, maintenance],
    ["Downtime", cs.downtime_cost, "downtime", fuel_logs, maintenance],
    ["Total cost", cs.total_cost, null, null, null],
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Overline>{v.type} · {v.make} {v.model} · {v.year}</Overline>
        <Text style={styles.title}>{label || v.plate}</Text>
        <Text style={styles.subtitle}>{v.plate}</Text>

        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity key={p.value} style={[styles.periodPill, period === p.value && styles.periodPillActive]} onPress={() => setPeriod(p.value)}>
              <Text style={[styles.periodText, period === p.value && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tileGrid}>
          {costTiles.map(([lbl, val, category, fuelLogs, maint]) => (
            <TouchableOpacity
              key={lbl}
              style={styles.tile}
              disabled={!category}
              onPress={() => category && navigation.navigate("CostBreakdown", { category, maintenance: maint, fuelLogs, label: lbl })}
            >
              <Card style={category ? styles.tileTappable : undefined}>
                <Overline>{lbl}</Overline>
                <Text style={styles.tileValue}>{money(val)}</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoGrid}>
          <Card style={styles.infoTile}>
            <Overline>Driver</Overline>
            <Text style={styles.value}>{driver ? driver.name : "Unassigned"}</Text>
          </Card>
          <Card style={styles.infoTile}>
            <Overline>Utilization</Overline>
            <Text style={styles.value}>{utilization.avg_km_per_day} km/day</Text>
          </Card>
          <Card style={styles.infoTile}>
            <Overline>Defects</Overline>
            <Text style={styles.value}>{defects.length} failed items</Text>
          </Card>
        </View>

        {lineData.length > 0 && (
          <Card style={styles.card}>
            <Overline>Monthly cost trend</Overline>
            <LineChart
              data={lineData}
              width={280}
              height={150}
              color={colors.primary}
              thickness={2}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 9 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
              rulesColor={colors.border}
              yAxisColor={colors.border}
              xAxisColor={colors.border}
              hideDataPoints
            />
          </Card>
        )}

        <Card style={styles.card}>
          <View style={styles.rowHeader}>
            <Overline>Fuel log ({fuel_logs.length})</Overline>
            <Button title={showFuelForm ? "Cancel" : "+ Log"} variant="outline" onPress={() => setShowFuelForm((s) => !s)} style={styles.smallBtn} />
          </View>
          {showFuelForm && (
            <View style={styles.formBlock}>
              <TextInput style={styles.input} placeholder="Litres" keyboardType="numeric" placeholderTextColor={colors.textMuted}
                value={fuelForm.litres} onChangeText={(v2) => setFuelForm((f) => ({ ...f, litres: v2 }))} />
              <TextInput style={styles.input} placeholder="Cost" keyboardType="numeric" placeholderTextColor={colors.textMuted}
                value={fuelForm.cost} onChangeText={(v2) => setFuelForm((f) => ({ ...f, cost: v2 }))} />
              <TextInput style={styles.input} placeholder="Location" placeholderTextColor={colors.textMuted}
                value={fuelForm.location} onChangeText={(v2) => setFuelForm((f) => ({ ...f, location: v2 }))} />
              <Button title="Save" onPress={logFuel} loading={submitting} />
            </View>
          )}
          {fuel_logs.slice(0, 10).map((f) => (
            <View key={f.id} style={styles.logRow}>
              <Text style={styles.logMeta}>{(f.occurred_at || "").slice(0, 10)} · {f.location || "—"}</Text>
              <Text style={styles.logValue}>{f.litres}L · {money(f.cost)}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <View style={styles.rowHeader}>
            <Overline>Trips ({tripLogs.length})</Overline>
            <Button title={showTripForm ? "Cancel" : "+ Log"} variant="outline" onPress={() => setShowTripForm((s) => !s)} style={styles.smallBtn} />
          </View>
          {showTripForm && (
            <View style={styles.formBlock}>
              <TextInput style={styles.input} placeholder="Distance (km)" keyboardType="numeric" placeholderTextColor={colors.textMuted}
                value={tripForm.distance_km} onChangeText={(v2) => setTripForm({ distance_km: v2 })} />
              <Button title="Save" onPress={logTrip} loading={submitting} />
            </View>
          )}
          {tripLogs.slice(0, 10).map((t) => (
            <View key={t.id} style={styles.logRow}>
              <Text style={styles.logMeta}>{(t.occurred_at || "").slice(0, 10)}</Text>
              <Text style={styles.logValue}>{t.distance_km} km</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Overline>Maintenance ({maintenance.length})</Overline>
          {maintenance.slice(0, 10).map((m) => (
            <View key={m.id} style={styles.logRow}>
              <Text style={styles.logMeta} numberOfLines={1}>{m.title}</Text>
              <Text style={styles.logValue}>{money(m.actual_cost || m.estimated_cost)}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Overline>Investigation timeline</Overline>
          {timeline.map((e, i) => (
            <TouchableOpacity key={i} style={styles.timelineRow} onPress={() => navigation.navigate("TransactionDetail", { event: e })}>
              <Text style={styles.timelineTitle} numberOfLines={1}>{e.title}</Text>
              <Text style={styles.timelineMeta}>{(e.at || "").slice(0, 10)}</Text>
            </TouchableOpacity>
          ))}
          {timeline.length === 0 && <Text style={styles.value}>No events yet.</Text>}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  centered: { justifyContent: "center", alignItems: "center" },
  muted: { color: colors.textMuted },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 2 },
  subtitle: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.md },
  periodRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
  periodPill: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  periodPillActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
  periodText: { color: colors.textMuted, fontSize: 11 },
  periodTextActive: { color: colors.primary, fontWeight: "700" },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  tile: { width: "48%" },
  tileTappable: { borderColor: colors.primary },
  tileValue: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 4 },
  infoGrid: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  infoTile: { flex: 1 },
  value: { color: colors.text, fontSize: 13, marginTop: 4 },
  card: { marginBottom: spacing.md },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  smallBtn: { paddingHorizontal: spacing.md },
  formBlock: { marginTop: spacing.sm, gap: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm, color: colors.text, fontSize: 13 },
  logRow: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs,
    borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, gap: spacing.sm,
  },
  logMeta: { color: colors.textMuted, fontSize: 12, flex: 1 },
  logValue: { color: colors.text, fontSize: 12, fontFamily: "monospace" },
  timelineRow: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm,
  },
  timelineTitle: { color: colors.text, fontSize: 13, flex: 1 },
  timelineMeta: { color: colors.textMuted, fontSize: 11 },
});
