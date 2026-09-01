import React, { useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Alert } from "react-native";
import { Screen, Card, Badge, Overline, Button } from "../../components/ui";
import { colors, spacing } from "../../lib/theme";
import { api } from "../../lib/api";

const money = (n) => `R${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const STATUS_TONE = { pending_approval: "warning", approved: "success", rejected: "danger" };

export default function RequisitionApprovalScreen({ route, navigation }) {
  const { requisition } = route.params;
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [saving, setSaving] = useState(false);

  const items = requisition.items || [];
  const total = items.reduce((s, it) => s + (Number(it.qty_requested) || 0) * (Number(it.unit_cost) || 0), 0);

  const decide = async (decision, decisionReason) => {
    setSaving(true);
    try {
      await api.post(`/parts-requisitions/${requisition.id}/decide`, { decision, reason: decisionReason });
      navigation.goBack();
    } catch (err) {
      Alert.alert("Failed", err?.response?.data?.detail || "Could not save this decision. Try again once you're back online.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Overline>Parts requisition</Overline>
          <Badge label={requisition.status.replace("_", " ")} tone={STATUS_TONE[requisition.status] || "muted"} />
        </View>
        <Text style={styles.title}>{requisition.job_title}</Text>
        <Text style={styles.sub}>Requested by {requisition.requested_by_name}</Text>

        <Card style={styles.card}>
          {items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>{it.part_name}</Text>
              <Text style={styles.itemMeta}>{it.qty_requested} × {money(it.unit_cost)}</Text>
              <Text style={styles.itemTotal}>{money((it.qty_requested || 0) * (it.unit_cost || 0))}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Estimated total</Text>
            <Text style={styles.totalValue}>{money(total)}</Text>
          </View>
        </Card>

        {!showReject ? (
          <View style={styles.actionRow}>
            <Button title="Approve" onPress={() => decide("approved", "")} loading={saving} style={styles.actionBtn} />
            <Button title="Reject" variant="outline" onPress={() => setShowReject(true)} disabled={saving} style={styles.actionBtn} />
          </View>
        ) : (
          <Card style={styles.card}>
            <Overline>Reason for rejection</Overline>
            <TextInput
              style={styles.input}
              placeholder="Required…"
              placeholderTextColor={colors.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
              autoFocus
            />
            <View style={styles.actionRow}>
              <Button title="Confirm rejection" onPress={() => decide("rejected", reason.trim())} disabled={!reason.trim()} loading={saving} style={styles.actionBtn} />
              <Button title="Cancel" variant="outline" onPress={() => { setShowReject(false); setReason(""); }} disabled={saving} style={styles.actionBtn} />
            </View>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: 4 },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  itemRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  itemMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  itemTotal: { color: colors.text, fontSize: 12, fontFamily: "monospace", marginTop: 2 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.sm },
  totalLabel: { color: colors.text, fontWeight: "700", fontSize: 13 },
  totalValue: { color: colors.primary, fontWeight: "700", fontSize: 13, fontFamily: "monospace" },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { flex: 1 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm,
    color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm, fontSize: 14, minHeight: 70, textAlignVertical: "top",
  },
});
