import React, { useCallback, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card, Overline, Button, EmptyState } from "../components/ui";
import { colors, spacing } from "../lib/theme";
import { getCachedParts, runSync } from "../lib/sync";
import { api } from "../lib/api";
import { queueSubmission } from "../lib/offlineQueue";

const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
});

export default function RequestPartsScreen({ route, navigation }) {
  const { jobId } = route.params;
  const [parts, setParts] = useState([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState({}); // part_id -> qty string
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(useCallback(() => {
    getCachedParts().then((p) => setParts(p.sort((a, b) => (a.name || "").localeCompare(b.name || ""))));
  }, []));

  const filtered = parts.filter((p) => (p.name || "").toLowerCase().includes(query.trim().toLowerCase()));
  const cartItems = Object.entries(cart).filter(([, qty]) => Number(qty) > 0);

  const submit = async () => {
    if (cartItems.length === 0) { Alert.alert("Add at least one part"); return; }
    const clientSubmissionId = uuid();
    const payload = {
      items: cartItems.map(([part_id, qty]) => ({ part_id, qty_requested: Number(qty) })),
      client_submission_id: clientSubmissionId,
    };
    setSubmitting(true);
    try {
      await api.post(`/maintenance/${jobId}/parts-requisitions`, payload);
      await runSync();
      navigation.goBack();
    } catch (err) {
      if (!err?.response) {
        await queueSubmission({ id: clientSubmissionId, kind: "parts_requisition", method: "POST", endpoint: `/maintenance/${jobId}/parts-requisitions`, payload });
        Alert.alert("Saved offline", "This parts request will submit automatically once you're back online.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert("Failed", err?.response?.data?.detail || "Could not submit this request.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Overline>Request parts</Overline>
        <TextInput
          style={styles.search}
          placeholder="Search parts…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState text="No parts found." />}
        renderItem={({ item }) => (
          <Card style={styles.partCard}>
            <View style={styles.partRow}>
              <View style={styles.partInfo}>
                <Text style={styles.partName}>{item.name}</Text>
                <Text style={styles.partMeta}>Stock: {item.stock ?? 0}</Text>
              </View>
              <View style={styles.qtyControls}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setCart((c) => ({ ...c, [item.id]: String(Math.max(0, (Number(c[item.id]) || 0) - 1)) }))}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="numeric"
                  value={cart[item.id] || ""}
                  onChangeText={(v) => setCart((c) => ({ ...c, [item.id]: v.replace(/[^0-9]/g, "") }))}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setCart((c) => ({ ...c, [item.id]: String((Number(c[item.id]) || 0) + 1) }))}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        )}
      />
      <View style={styles.footer}>
        <Button
          title={`Submit request (${cartItems.length})`}
          onPress={submit}
          loading={submitting}
          disabled={cartItems.length === 0}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, paddingTop: spacing.xxl },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm,
    color: colors.text, fontSize: 14, marginTop: spacing.sm,
  },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  partCard: { marginBottom: spacing.sm },
  partRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  partInfo: { flex: 1, marginRight: spacing.sm },
  partName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  partMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  qtyBtn: { width: 32, height: 32, borderWidth: 1, borderColor: colors.border, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  qtyBtnText: { color: colors.text, fontSize: 16 },
  qtyInput: { width: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 4, color: colors.text, textAlign: "center", paddingVertical: 6 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
