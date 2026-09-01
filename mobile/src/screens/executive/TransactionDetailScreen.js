import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Image, StyleSheet } from "react-native";
import { Screen, Card, Overline } from "../../components/ui";
import { colors, spacing } from "../../lib/theme";
import { api } from "../../lib/api";

const money = (n) => `R${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Overline>{label}</Overline>
      <Text style={styles.fieldValue}>{value ?? "—"}</Text>
    </View>
  );
}

function useRecord(endpoint) {
  const [rec, setRec] = useState(null);
  useEffect(() => {
    api.get(endpoint).then((r) => setRec(r.data)).catch(() => {});
  }, [endpoint]);
  return rec;
}

function FuelDetail({ id }) {
  const rec = useRecord(`/fuel-logs/${id}`);
  if (!rec) return <Text style={styles.muted}>Loading…</Text>;
  return (
    <View style={styles.grid}>
      <Field label="Vehicle" value={`${rec.vehicle_name} (${rec.vehicle_plate})`} />
      <Field label="Driver" value={rec.driver_name} />
      <Field label="Litres" value={`${rec.litres} L`} />
      <Field label="Cost" value={money(rec.cost)} />
      <Field label="Location" value={rec.location} />
      <Field label="Date" value={(rec.occurred_at || "").slice(0, 16).replace("T", " ")} />
    </View>
  );
}

function MaintenanceDetail({ id }) {
  const rec = useRecord(`/maintenance/${id}`);
  if (!rec) return <Text style={styles.muted}>Loading…</Text>;
  return (
    <View>
      <View style={styles.grid}>
        <Field label="Vehicle" value={`${rec.vehicle_name} (${rec.vehicle_plate})`} />
        <Field label="Workshop / mechanic" value={rec.assigned_to_name || "Unassigned"} />
        <Field label="Status" value={rec.status} />
        <Field label="Priority" value={rec.priority} />
        <Field label="Invoice total" value={money(rec.actual_cost || rec.estimated_cost)} />
        <Field label="Downtime" value={`${rec.downtime_hours || 0} h`} />
        <Field label="Labour" value={money(rec.labor_cost)} />
        <Field label="Parts" value={money(rec.parts_cost)} />
      </View>
      {!!rec.description && (
        <View style={styles.notes}>
          <Overline>Notes</Overline>
          <Text style={styles.notesText}>{rec.description}</Text>
        </View>
      )}
    </View>
  );
}

function IncidentDetail({ id }) {
  const rec = useRecord(`/incidents/${id}`);
  if (!rec) return <Text style={styles.muted}>Loading…</Text>;
  return (
    <View>
      <View style={styles.grid}>
        <Field label="Vehicle" value={`${rec.vehicle_name} (${rec.vehicle_plate})`} />
        <Field label="Driver report" value={rec.driver_name} />
        <Field label="Kind" value={rec.kind} />
        <Field label="Severity" value={rec.severity} />
        <Field label="Status" value={rec.resolved ? "Resolved" : "Open"} />
        <Field label="Occurred" value={(rec.occurred_at || "").slice(0, 16).replace("T", " ")} />
      </View>
      <View style={styles.notes}>
        <Overline>Description</Overline>
        <Text style={styles.notesText}>{rec.description}</Text>
      </View>
      {rec.photos?.length > 0 && (
        <View style={styles.notes}>
          <Overline>Images ({rec.photos.length})</Overline>
          <View style={styles.photoRow}>
            {rec.photos.map((p, i) => <Image key={i} source={{ uri: p }} style={styles.thumb} />)}
          </View>
        </View>
      )}
    </View>
  );
}

function DefectDetail({ id, itemId, noteHint }) {
  const rec = useRecord(`/inspections/${id}`);
  if (!rec) return <Text style={styles.muted}>Loading…</Text>;
  const answer = (rec.answers || []).find((a) => a.item_id === itemId);
  return (
    <View>
      <View style={styles.grid}>
        <Field label="Inspector" value={rec.inspector_name} />
        <Field label="Date" value={(rec.created_at || "").slice(0, 10)} />
        <Field label="Value" value={answer?.value || "fail"} />
      </View>
      <View style={styles.notes}>
        <Overline>Note</Overline>
        <Text style={styles.notesText}>{answer?.note || noteHint || "No note provided"}</Text>
      </View>
      {!!answer?.photo && <Image source={{ uri: answer.photo }} style={styles.photoLarge} />}
    </View>
  );
}

function InspectionDetail({ id }) {
  const rec = useRecord(`/inspections/${id}`);
  if (!rec) return <Text style={styles.muted}>Loading…</Text>;
  return (
    <View>
      <View style={styles.grid}>
        <Field label="Inspector" value={rec.inspector_name} />
        <Field label="Date" value={(rec.created_at || "").slice(0, 10)} />
        <Field label="Failed items" value={rec.fail_count} />
      </View>
      {!!rec.notes && (
        <View style={styles.notes}>
          <Overline>Notes</Overline>
          <Text style={styles.notesText}>{rec.notes}</Text>
        </View>
      )}
    </View>
  );
}

export default function TransactionDetailScreen({ route }) {
  const { event } = route.params;
  const { type, meta, title } = event;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Overline>Root cause · {type}</Overline>
        <Text style={styles.title}>{title}</Text>
        <Card style={styles.card}>
          {type === "fuel" && <FuelDetail id={meta.id} />}
          {type === "maintenance" && <MaintenanceDetail id={meta.id} />}
          {type === "incident" && <IncidentDetail id={meta.id} />}
          {type === "defect" && <DefectDetail id={meta.id} itemId={meta.item_id} noteHint={meta.note} />}
          {type === "inspection" && <InspectionDetail id={meta.id} />}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: 2, marginBottom: spacing.md },
  card: { marginBottom: spacing.md },
  muted: { color: colors.textMuted, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  field: { width: "45%", marginBottom: spacing.sm },
  fieldValue: { color: colors.text, fontSize: 14, marginTop: 2 },
  notes: { marginTop: spacing.md },
  notesText: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: 4 },
  photoLarge: { width: 160, height: 160, borderRadius: 6, marginTop: spacing.sm },
});
