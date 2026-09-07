import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, Image, Modal } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import SignatureScreen from "react-native-signature-canvas";
import { Screen, Card, Overline, Button, Badge } from "../components/ui";
import { colors, spacing } from "../lib/theme";
import { getCachedTemplates, getCachedVehicle, runSync } from "../lib/sync";
import { api } from "../lib/api";
import { queueSubmission } from "../lib/offlineQueue";

const DEFECT_TYPES = ["tyres", "engine", "brakes", "electrical", "bodywork", "general"];

const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
});

export default function InspectionScreen({ route, navigation }) {
  const { vehicleId, vehicleName } = route.params;
  const clientSubmissionId = React.useRef(uuid()).current;
  const startedAt = React.useRef(new Date().toISOString()).current;

  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [notes, setNotes] = useState("");
  const [odometer, setOdometer] = useState("");
  const [signature, setSignature] = useState(null);
  const [showSignature, setShowSignature] = useState(false);
  const signatureRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(useCallback(() => {
    getCachedTemplates().then((all) => {
      const matching = all.filter((t) => (t.type || "vehicle") === "vehicle");
      setTemplates(matching);
      if (matching[0]) setTemplateId(matching[0].id);
    });
    getCachedVehicle(vehicleId).then((v) => { if (v?.odometer) setOdometer(String(v.odometer)); });
  }, [vehicleId]));

  const template = templates.find((t) => t.id === templateId);

  const setAnswer = (itemId, value) => setAnswers((a) => ({ ...a, [itemId]: { ...(a[itemId] || {}), value } }));
  const setAnswerNote = (itemId, note) => setAnswers((a) => ({ ...a, [itemId]: { ...(a[itemId] || {}), note } }));
  const setAnswerDefectType = (itemId, defect_type) => setAnswers((a) => ({ ...a, [itemId]: { ...(a[itemId] || {}), defect_type } }));

  const addPhoto = async (itemId) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
    if (!result.canceled && result.assets?.[0]) {
      const photo = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAnswers((a) => ({ ...a, [itemId]: { ...(a[itemId] || {}), photo } }));
    }
  };

  const failCount = Object.values(answers).filter((a) => String(a.value).toLowerCase() === "fail").length;

  const defectValidationErrors = template
    ? template.sections.flatMap((s) => s.items)
        .filter((it) => String((answers[it.id] || {}).value).toLowerCase() === "fail")
        .map((it) => {
          const a = answers[it.id] || {};
          const missing = [];
          if (!a.defect_type) missing.push("defect type");
          if (!a.photo) missing.push("photo");
          if (!a.note || !a.note.trim()) missing.push("note");
          return missing.length ? { item: it, missing } : null;
        })
        .filter(Boolean)
    : [];

  const odometerMissing = odometer === "" || Number(odometer) <= 0;
  const canSubmit = !odometerMissing && !!signature && defectValidationErrors.length === 0 && !!template;

  const submit = async () => {
    if (!canSubmit) return;
    const payload = {
      template_id: template.id,
      vehicle_id: vehicleId,
      odometer: Number(odometer) || null,
      notes,
      answers: Object.entries(answers).map(([item_id, a]) => ({
        item_id, value: String(a.value || ""), note: a.note || "", photo: a.photo || null, defect_type: a.defect_type || null,
      })),
      completed_at: new Date().toISOString(),
      started_at: startedAt,
      signature,
      location_status: "not_attempted",
      client_submission_id: clientSubmissionId,
    };
    setSubmitting(true);
    try {
      await api.post("/inspections", payload);
      await runSync();
      Alert.alert("Inspection complete", `${failCount} failed item(s)`, [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch (err) {
      if (!err?.response) {
        await queueSubmission({ id: clientSubmissionId, kind: "inspection", method: "POST", endpoint: "/inspections", payload });
        Alert.alert("Saved offline", "This inspection will sync automatically once you're back online.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert("Failed to submit", err?.response?.data?.detail || "Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!template) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.muted}>
          {templates.length === 0 ? "No checklist templates cached yet -- connect once to sync." : "Loading…"}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Overline>{vehicleName}</Overline>
        <Text style={styles.title}>Digital Inspection</Text>
        <Text style={styles.subtitle}>{template.name}</Text>

        <Card style={styles.card}>
          <Overline>Odometer (km) *</Overline>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={odometer}
            onChangeText={setOdometer}
          />
        </Card>

        {template.sections.map((sec, si) => (
          <Card key={sec.id} style={styles.card}>
            <Overline>Section {si + 1}</Overline>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            {sec.items.map((it) => {
              const a = answers[it.id] || {};
              const isFail = String(a.value).toLowerCase() === "fail";
              return (
                <View key={it.id} style={styles.item}>
                  <Text style={styles.itemLabel}>{it.label}{it.required ? " *" : ""}</Text>
                  {it.type === "boolean" && (
                    <View style={styles.row}>
                      <TouchableOpacity
                        style={[styles.pill, a.value === "pass" && styles.pillPass]}
                        onPress={() => setAnswer(it.id, "pass")}
                      >
                        <Text style={[styles.pillText, a.value === "pass" && styles.pillTextPass]}>Pass</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pill, isFail && styles.pillFail]}
                        onPress={() => setAnswer(it.id, "fail")}
                      >
                        <Text style={[styles.pillText, isFail && styles.pillTextFail]}>Fail</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {it.type === "rating" && (
                    <View style={styles.row}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <TouchableOpacity
                          key={n}
                          style={[styles.ratingBox, String(a.value) === String(n) && styles.ratingBoxActive]}
                          onPress={() => setAnswer(it.id, String(n))}
                        >
                          <Text style={styles.ratingText}>{n}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {(it.type === "text" || it.type === "number") && (
                    <TextInput
                      style={styles.input}
                      keyboardType={it.type === "number" ? "numeric" : "default"}
                      value={a.value || ""}
                      onChangeText={(v) => setAnswer(it.id, v)}
                    />
                  )}
                  {!isFail && (
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Note…"
                      placeholderTextColor={colors.textMuted}
                      value={a.note || ""}
                      onChangeText={(v) => setAnswerNote(it.id, v)}
                    />
                  )}
                  {isFail && (
                    <View style={styles.defectBlock}>
                      <View style={styles.row}>
                        {DEFECT_TYPES.map((dt) => (
                          <TouchableOpacity
                            key={dt}
                            style={[styles.defectType, a.defect_type === dt && styles.defectTypeActive]}
                            onPress={() => setAnswerDefectType(it.id, dt)}
                          >
                            <Text style={styles.defectTypeText}>{dt}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        style={styles.noteInput}
                        placeholder="Describe the defect… *"
                        placeholderTextColor={colors.textMuted}
                        value={a.note || ""}
                        onChangeText={(v) => setAnswerNote(it.id, v)}
                      />
                      <Button
                        title={a.photo ? "Photo captured" : "+ Photo (required)"}
                        variant="outline"
                        onPress={() => addPhoto(it.id)}
                        style={{ marginTop: spacing.sm }}
                      />
                      {a.photo && <Image source={{ uri: a.photo }} style={styles.thumb} />}
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        ))}

        <Card style={styles.card}>
          <Overline>General notes</Overline>
          <TextInput style={styles.noteInput} value={notes} onChangeText={setNotes} multiline />
        </Card>

        <Card style={styles.card}>
          <Overline>Signature *</Overline>
          {signature ? (
            <View>
              <Image source={{ uri: signature }} style={styles.signaturePreview} />
              <Button title="Re-sign" variant="outline" onPress={() => setShowSignature(true)} style={{ marginTop: spacing.sm }} />
            </View>
          ) : (
            <Button title="Sign" variant="outline" onPress={() => setShowSignature(true)} />
          )}
        </Card>

        {!canSubmit && (
          <Text style={styles.warning}>
            Before you can submit: {[
              odometerMissing && "odometer reading",
              !signature && "signature",
              defectValidationErrors.length > 0 && "defect type/photo/note on every failed item",
            ].filter(Boolean).join(", ")}.
          </Text>
        )}

        <Button title={`Complete inspection${failCount > 0 ? " & flag defects" : ""}`} onPress={submit} disabled={!canSubmit} loading={submitting} style={{ marginTop: spacing.lg }} />
      </ScrollView>

      <Modal visible={showSignature} animationType="slide">
        <SafeAreaView style={styles.sigModal} edges={["top", "bottom"]}>
          <View style={styles.sigHeader}>
            <Text style={styles.sigHeaderText}>Sign below</Text>
          </View>
          <View style={styles.sigPadWrap}>
            <SignatureScreen
              ref={signatureRef}
              style={styles.sigCanvas}
              onOK={(sig) => { setSignature(sig); setShowSignature(false); }}
              onEmpty={() => Alert.alert("Nothing to save", "Draw a signature first.")}
              descriptionText=""
              // The library's own internal Clear/Confirm buttons never rendered visibly on a real
              // device across several layout attempts -- hidden here, and driven instead via the
              // imperative ref (readSignature/clearSignature) from ordinary RN buttons below, which
              // have rendered reliably in every attempt so far.
              webStyle="body,html{background:#0b0b0d;} .m-signature-pad--footer{display:none;}"
            />
          </View>
          <View style={styles.sigFooter}>
            <Button title="Cancel" variant="outline" onPress={() => setShowSignature(false)} style={styles.sigFooterBtn} />
            <Button title="Clear" variant="outline" onPress={() => signatureRef.current?.clearSignature()} style={styles.sigFooterBtn} />
            <Button title="Confirm" onPress={() => signatureRef.current?.readSignature()} style={styles.sigFooterBtn} />
          </View>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  centered: { justifyContent: "center", alignItems: "center" },
  muted: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 2 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 4, marginBottom: spacing.sm },
  item: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm },
  itemLabel: { color: colors.text, fontSize: 14, marginBottom: spacing.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pillPass: { borderColor: colors.success, backgroundColor: `${colors.success}22` },
  pillFail: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
  pillText: { color: colors.textMuted, fontSize: 12, textTransform: "uppercase", fontWeight: "700" },
  pillTextPass: { color: colors.success },
  pillTextFail: { color: colors.primary },
  ratingBox: { width: 32, height: 32, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", borderRadius: 4 },
  ratingBoxActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
  ratingText: { color: colors.text, fontSize: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm, color: colors.text, marginTop: spacing.xs },
  noteInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm, color: colors.text, marginTop: spacing.xs, fontSize: 13 },
  defectBlock: { marginTop: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: spacing.sm },
  defectType: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  defectTypeActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
  defectTypeText: { color: colors.textMuted, fontSize: 11, textTransform: "uppercase" },
  thumb: { width: 64, height: 64, borderRadius: 4, marginTop: spacing.sm },
  signaturePreview: { width: "100%", height: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: "#fff" },
  warning: { color: colors.primary, fontSize: 12, marginTop: spacing.md },
  sigModal: { flex: 1, backgroundColor: colors.background },
  sigHeader: { padding: spacing.lg },
  sigHeaderText: { color: colors.textMuted, fontSize: 13 },
  sigPadWrap: { flex: 1, marginHorizontal: spacing.lg },
  sigCanvas: { flex: 1 },
  sigFooter: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  sigFooterBtn: { flex: 1 },
});
