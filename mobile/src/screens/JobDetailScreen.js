import React, { useCallback, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { Screen, Card, Badge, Overline, Button } from "../components/ui";
import { colors, spacing } from "../lib/theme";
import { getCachedJob, getCachedVehicles, runSync } from "../lib/sync";
import { api } from "../lib/api";
import { queueSubmission } from "../lib/offlineQueue";

const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
});

export default function JobDetailScreen({ route, navigation }) {
  const { jobId } = route.params;
  const [job, setJob] = useState(null);
  const [vehicleName, setVehicleName] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    workshop_name: "", technician: "", vendor: "",
    parts_cost: "", labor_cost: "", external_cost: "",
    odometer: "", engine_hours: "",
  });
  const [documents, setDocuments] = useState([]);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    const [j, vehicles] = await Promise.all([getCachedJob(jobId), getCachedVehicles()]);
    setJob(j);
    if (j?.vehicle_id) setVehicleName(vehicles.find((v) => v.id === j.vehicle_id)?.name || "");
  }, [jobId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      setDocuments((d) => [...d, { name: `photo-${d.length + 1}.jpg`, data: `data:image/jpeg;base64,${a.base64}` }]);
    }
  };

  const applyPatch = async (patch, { withClientId } = {}) => {
    const clientSubmissionId = withClientId ? uuid() : undefined;
    const payload = clientSubmissionId ? { ...patch, client_submission_id: clientSubmissionId } : patch;
    try {
      await api.patch(`/maintenance/${jobId}`, payload);
      await runSync();
      await load();
    } catch (err) {
      if (!err?.response) {
        // Network failure -- queue it so the update survives even if the mechanic navigates away.
        await queueSubmission({
          id: clientSubmissionId || uuid(),
          kind: "job_completion",
          method: "PATCH",
          endpoint: `/maintenance/${jobId}`,
          payload: clientSubmissionId ? payload : { ...payload, client_submission_id: uuid() },
        });
        Alert.alert("Saved offline", "This update will sync automatically once you're back online.");
        // Optimistically reflect the change locally so the screen doesn't look like nothing happened.
        setJob((j) => ({ ...j, ...patch }));
      } else {
        Alert.alert("Failed", err?.response?.data?.detail || "Could not save this update.");
      }
    }
  };

  const start = () => applyPatch({ status: "in_progress" });

  const submitCompletion = async () => {
    setSaving(true);
    const patch = {
      status: "completed",
      workshop_name: form.workshop_name || undefined,
      technician: form.technician || undefined,
      vendor: form.vendor || undefined,
      parts_cost: form.parts_cost ? Number(form.parts_cost) : undefined,
      labor_cost: form.labor_cost ? Number(form.labor_cost) : undefined,
      external_cost: form.external_cost ? Number(form.external_cost) : undefined,
      odometer: form.odometer ? Number(form.odometer) : undefined,
      engine_hours: form.engine_hours ? Number(form.engine_hours) : undefined,
      completion_documents: documents.length ? documents : undefined,
    };
    await applyPatch(patch, { withClientId: true });
    setSaving(false);
    setCompleting(false);
  };

  if (!job) return <Screen style={styles.centered}><Text style={styles.muted}>Loading…</Text></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Overline>{vehicleName || job.asset_name || "Unassigned"}</Overline>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{job.title}</Text>
          <Badge label={job.status.replace("_", " ")} tone={job.status === "completed" ? "success" : job.status === "in_progress" ? "primary" : "muted"} />
        </View>
        {!!job.description && <Text style={styles.description}>{job.description}</Text>}

        <Card style={styles.card}>
          <Overline>Priority</Overline>
          <Text style={styles.value}>{job.priority}</Text>
        </Card>

        {job.status === "pending" && <Button title="Start job" onPress={start} style={styles.action} />}

        {job.status === "in_progress" && !completing && (
          <Button title="Complete job" onPress={() => setCompleting(true)} style={styles.action} />
        )}

        {completing && (
          <Card style={styles.action}>
            <Overline>Complete job</Overline>
            {[
              ["workshop_name", "Workshop name"], ["technician", "Technician"], ["vendor", "Vendor"],
              ["parts_cost", "Parts cost"], ["labor_cost", "Labor cost"], ["external_cost", "External cost"],
              ["odometer", "Odometer"], ["engine_hours", "Engine hours"],
            ].map(([key, label]) => (
              <TextInput
                key={key}
                style={styles.input}
                placeholder={label}
                placeholderTextColor={colors.textMuted}
                value={form[key]}
                onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                keyboardType={key.includes("cost") || key === "odometer" || key === "engine_hours" ? "numeric" : "default"}
              />
            ))}
            <Button title={`Add photo (${documents.length})`} variant="outline" onPress={addPhoto} style={{ marginBottom: spacing.md }} />
            <Button title="Submit completion" onPress={submitCompletion} loading={saving} />
          </Card>
        )}

        {job.status === "completed" && (
          <Card style={styles.action}>
            <Overline>Completed</Overline>
            <Text style={styles.value}>Actual cost: {job.actual_cost}</Text>
            <Text style={styles.value}>Downtime: {job.downtime_hours}h</Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  centered: { justifyContent: "center", alignItems: "center" },
  muted: { color: colors.textMuted },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xs, marginBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, flex: 1, marginRight: spacing.sm },
  description: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  value: { color: colors.text, fontSize: 15, marginTop: 4 },
  action: { marginTop: spacing.lg },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm,
    color: colors.text, marginBottom: spacing.sm, fontSize: 14,
  },
});
