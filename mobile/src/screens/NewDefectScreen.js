import React, { useState } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Screen, Card, Overline, Button } from "../components/ui";
import { colors, spacing } from "../lib/theme";
import { api } from "../lib/api";
import { queueSubmission } from "../lib/offlineQueue";
import { runSync } from "../lib/sync";

const CATEGORIES = ["tyres", "engine", "brakes", "electrical", "bodywork", "general"];
const SEVERITIES = ["low", "medium", "high", "critical"];

const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
});

export default function NewDefectScreen({ navigation }) {
  const [category, setCategory] = useState("general");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!description.trim()) { Alert.alert("Description required"); return; }
    const clientSubmissionId = uuid();
    const payload = { category, severity, description, client_submission_id: clientSubmissionId };
    setSubmitting(true);
    try {
      await api.post("/defects", payload);
      await runSync();
      navigation.goBack();
    } catch (err) {
      if (!err?.response) {
        await queueSubmission({ id: clientSubmissionId, kind: "defect", method: "POST", endpoint: "/defects", payload });
        Alert.alert("Saved offline", "This defect will sync automatically once you're back online.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert("Failed", err?.response?.data?.detail || "Could not report this defect.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Overline>New defect</Overline>
        <Text style={styles.title}>Report a defect</Text>

        <Card style={styles.card}>
          <Overline>Category</Overline>
          <View style={styles.row}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity key={c} style={[styles.pill, category === c && styles.pillActive]} onPress={() => setCategory(c)}>
                <Text style={[styles.pillText, category === c && styles.pillTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card style={styles.card}>
          <Overline>Severity</Overline>
          <View style={styles.row}>
            {SEVERITIES.map((s) => (
              <TouchableOpacity key={s} style={[styles.pill, severity === s && styles.pillActive]} onPress={() => setSeverity(s)}>
                <Text style={[styles.pillText, severity === s && styles.pillTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card style={styles.card}>
          <Overline>Description *</Overline>
          <TextInput
            style={styles.textarea}
            multiline
            placeholder="Describe the defect…"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
          />
        </Card>

        <Button title="Submit defect" onPress={submit} loading={submitting} disabled={!description.trim()} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 2, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pillActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
  pillText: { color: colors.textMuted, fontSize: 12, textTransform: "capitalize" },
  pillTextActive: { color: colors.primary, fontWeight: "700" },
  textarea: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm, color: colors.text, marginTop: spacing.xs, minHeight: 100, textAlignVertical: "top" },
});
