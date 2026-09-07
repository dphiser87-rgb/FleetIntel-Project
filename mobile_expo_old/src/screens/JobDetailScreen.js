import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { Screen, Card, Badge, Overline, Button } from "../components/ui";
import { colors, spacing } from "../lib/theme";
import { getCachedJob, getCachedVehicles, runSync, pullJobRequisitions, getCachedJobRequisitions } from "../lib/sync";
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
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [requisitions, setRequisitions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [holding, setHolding] = useState(false);

  const load = useCallback(async () => {
    const [j, vehicles] = await Promise.all([getCachedJob(jobId), getCachedVehicles()]);
    setJob(j);
    if (j?.vehicle_id) setVehicleName(vehicles.find((v) => v.id === j.vehicle_id)?.name || "");
    pullJobRequisitions(jobId).then(setRequisitions);
    api.get("/audit", { params: { entity_id: jobId } }).then((r) => setActivity(r.data || [])).catch(() => {});
  }, [jobId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Only seed the draft from the server value on first load / after it changes elsewhere -- not on
  // every load() call, or a half-typed note would get clobbered by a background sync.
  useEffect(() => { setNoteDraft((prev) => (prev === "" ? job?.notes || "" : prev)); }, [job?.notes]);

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
  const putOnHold = () => applyPatch({ status: "on_hold" });

  const resume = async () => {
    setHolding(true);
    try {
      await api.post(`/maintenance/${jobId}/resume`);
      await runSync();
      await load();
    } catch (err) {
      Alert.alert("Failed", err?.response?.data?.detail || "Could not resume this job. Try again once you're back online.");
    } finally {
      setHolding(false);
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    await applyPatch({ notes: noteDraft });
    setSavingNote(false);
  };

  const addMidJobPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
    if (result.canceled || !result.assets?.[0]) return;
    const clientSubmissionId = uuid();
    const payload = { name: `photo-${Date.now()}.jpg`, data: `data:image/jpeg;base64,${result.assets[0].base64}`, client_submission_id: clientSubmissionId };
    setAddingPhoto(true);
    try {
      await api.post(`/maintenance/${jobId}/photos`, payload);
      await runSync();
      await load();
    } catch (err) {
      if (!err?.response) {
        await queueSubmission({ id: clientSubmissionId, kind: "job_photo", method: "POST", endpoint: `/maintenance/${jobId}/photos`, payload });
        Alert.alert("Saved offline", "This photo will attach automatically once you're back online.");
      } else {
        Alert.alert("Failed", err?.response?.data?.detail || "Could not attach this photo.");
      }
    } finally {
      setAddingPhoto(false);
    }
  };

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
      // Merge with anything already attached mid-job (via the separate /photos endpoint) --
      // completion_documents is a whole-column PATCH, so sending only the new batch would silently
      // drop earlier photos instead of adding to them.
      completion_documents: documents.length ? [...(job.completion_documents || []), ...documents] : undefined,
    };
    await applyPatch(patch, { withClientId: true });
    setSaving(false);
    setCompleting(false);
  };

  if (!job) return <Screen style={styles.centered}><Text style={styles.muted}>Loading…</Text></Screen>;

  const hasPendingRequisition = requisitions.some((r) => r.status === "pending_approval");
  const REQ_TONE = { pending_approval: "primary", approved: "success", rejected: "danger" };
  const JOB_TONE = { completed: "success", in_progress: "primary", on_hold: "warning" };
  // Most recent requisition (not just a pending one), so approved/rejected still shows here instead
  // of the badge just disappearing once decided.
  const latestRequisition = [...requisitions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const PARTS_BADGE = {
    pending_approval: { label: "Awaiting parts", tone: "warning" },
    approved: { label: "Parts approved", tone: "success" },
    rejected: { label: "Parts rejected", tone: "danger" },
  }[latestRequisition?.status];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Overline>{vehicleName || job.asset_name || "Unassigned"}</Overline>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{job.title}</Text>
          <Badge label={job.status.replace("_", " ")} tone={JOB_TONE[job.status] || "muted"} />
        </View>
        {!!job.description && <Text style={styles.description}>{job.description}</Text>}
        {PARTS_BADGE && job.status !== "completed" && (
          <Badge label={PARTS_BADGE.label} tone={PARTS_BADGE.tone} />
        )}

        <Card style={styles.card}>
          <Overline>Priority</Overline>
          <Text style={styles.value}>{job.priority}</Text>
        </Card>

        {job.status === "pending" && <Button title="Start job" onPress={start} style={styles.action} />}

        {job.status === "in_progress" && (
          <Button title="Put on hold" variant="outline" onPress={putOnHold} style={styles.action} />
        )}

        {job.status === "on_hold" && (
          <Button title="Resume" onPress={resume} loading={holding} style={styles.action} />
        )}

        {job.status !== "completed" && (
          <Card style={styles.action}>
            <Overline>Notes</Overline>
            <TextInput
              style={styles.noteInput}
              placeholder="Add a note about progress, parts needed, etc."
              placeholderTextColor={colors.textMuted}
              value={noteDraft}
              onChangeText={setNoteDraft}
              multiline
            />
            <Button title="Save note" variant="outline" onPress={saveNote} loading={savingNote} disabled={noteDraft === (job.notes || "")} style={{ marginTop: spacing.sm }} />
          </Card>
        )}

        {job.status !== "completed" && (
          <Card style={styles.action}>
            <Overline>Photos ({(job.completion_documents || []).length})</Overline>
            {(job.completion_documents || []).length > 0 && (
              <View style={styles.photoRow}>
                {job.completion_documents.map((d, i) => (
                  <Image key={d.client_submission_id || i} source={{ uri: d.data }} style={styles.thumb} />
                ))}
              </View>
            )}
            <Button title="Add photo" variant="outline" onPress={addMidJobPhoto} loading={addingPhoto} style={{ marginTop: spacing.sm }} />
          </Card>
        )}

        {job.status !== "completed" && (
          <Card style={styles.action}>
            <Overline>Parts</Overline>
            {requisitions.length === 0 && <Text style={styles.value}>No parts requested yet.</Text>}
            {requisitions.map((r) => (
              <View key={r.id} style={styles.reqBlock}>
                <View style={styles.reqRow}>
                  <Text style={styles.reqItems} numberOfLines={1}>
                    {(r.items || []).map((it) => `${it.qty_requested}× ${it.part_name}`).join(", ")}
                  </Text>
                  <Badge
                    label={r.status === "pending_approval" ? "Pending approval" : r.status === "rejected" ? "Rejected" : "Approved"}
                    tone={REQ_TONE[r.status] || "muted"}
                  />
                </View>
                {r.status === "rejected" && (
                  <>
                    {!!r.decision?.reason && <Text style={styles.rejectReason}>{r.decision.reason}</Text>}
                    <Button
                      title="Resubmit"
                      variant="outline"
                      onPress={() => navigation.navigate("RequestParts", { jobId, prefillItems: r.items })}
                      style={{ marginTop: spacing.xs }}
                    />
                  </>
                )}
              </View>
            ))}
            <Button title="Request parts" variant="outline" onPress={() => navigation.navigate("RequestParts", { jobId })} style={{ marginTop: spacing.sm }} />
          </Card>
        )}

        {hasPendingRequisition && job.status !== "completed" && (
          <Text style={styles.warning}>A parts request is awaiting approval — this job can't be completed until it's decided.</Text>
        )}

        {job.status === "in_progress" && !completing && (
          <Button title="Complete job" onPress={() => setCompleting(true)} disabled={hasPendingRequisition} style={styles.action} />
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

        <Card style={styles.action}>
          <Overline>Activity</Overline>
          {activity.length === 0 && <Text style={styles.value}>No activity yet.</Text>}
          {activity.map((e) => (
            <View key={e.id} style={styles.activityRow}>
              <Text style={styles.activityText}>{e.user_name} <Text style={styles.activityAction}>· {e.action}</Text></Text>
              <Text style={styles.activityTime}>{new Date(e.at).toLocaleString()}</Text>
            </View>
          ))}
        </Card>
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
  noteInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm,
    color: colors.text, fontSize: 14, minHeight: 70, textAlignVertical: "top",
  },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: 4 },
  reqBlock: { marginTop: spacing.sm },
  reqRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  reqItems: { color: colors.text, fontSize: 13, flex: 1 },
  rejectReason: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  warning: { color: colors.primary, fontSize: 12, marginTop: spacing.md },
  activityRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm, gap: spacing.sm },
  activityText: { color: colors.text, fontSize: 13, flex: 1 },
  activityAction: { color: colors.textMuted },
  activityTime: { color: colors.textMuted, fontSize: 11 },
});
