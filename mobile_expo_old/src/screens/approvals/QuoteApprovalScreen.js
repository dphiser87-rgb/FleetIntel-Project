import React, { useState } from "react";
import { View, Text, TextInput, ScrollView, Image, StyleSheet, Alert } from "react-native";
import { Screen, Card, Badge, Overline, Button } from "../../components/ui";
import { colors, spacing } from "../../lib/theme";
import { api } from "../../lib/api";

const money = (n) => `R${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const STAGE_LABEL = { pending_ops: "Pending — Operations", pending_finance: "Pending — Finance", approved: "Approved", rejected: "Rejected" };
const STAGE_TONE = { pending_ops: "warning", pending_finance: "warning", approved: "success", rejected: "danger" };

export default function QuoteApprovalScreen({ route, navigation }) {
  const { quote } = route.params;
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [saving, setSaving] = useState(false);

  const items = quote.items || [];
  const attachments = quote.attachments || [];

  const decide = async (decision, decisionReason) => {
    setSaving(true);
    try {
      await api.post(`/quotes/${quote.id}/decide`, { decision, reason: decisionReason });
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
          <Overline>Quote costing</Overline>
          <Badge label={STAGE_LABEL[quote.stage] || quote.stage} tone={STAGE_TONE[quote.stage] || "muted"} />
        </View>
        <Text style={styles.title}>{quote.job_title}</Text>
        <Text style={styles.sub}>Submitted by {quote.submitted_by_name}</Text>

        <Card style={styles.card}>
          {items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemType}>{it.type}</Text>
              <Text style={styles.itemName} numberOfLines={1}>{it.description}</Text>
              <Text style={styles.itemMeta}>{it.qty} × {money(it.unit_cost)} · VAT {it.vat_pct}%</Text>
              <Text style={styles.itemTotal}>{money(it.qty * it.unit_cost * (1 + it.vat_pct / 100))}</Text>
            </View>
          ))}
          <View style={styles.totalsBlock}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalMuted}>{money(quote.subtotal)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>VAT</Text><Text style={styles.totalMuted}>{money(quote.vat_total)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabelBold}>Total</Text><Text style={styles.totalValue}>{money(quote.total)}</Text></View>
          </View>
        </Card>

        {attachments.length > 0 && (
          <Card style={styles.card}>
            <Overline>Attachments ({attachments.length})</Overline>
            <View style={styles.photoRow}>
              {attachments.map((a) =>
                a.file_type?.startsWith("image/") ? (
                  <Image key={a.id} source={{ uri: a.data_url }} style={styles.thumb} />
                ) : (
                  <View key={a.id} style={styles.fileChip}><Text style={styles.fileChipText} numberOfLines={1}>{a.file_name}</Text></View>
                )
              )}
            </View>
          </Card>
        )}

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
  itemType: { color: colors.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  itemName: { color: colors.text, fontSize: 14, fontWeight: "600", marginTop: 2 },
  itemMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  itemTotal: { color: colors.text, fontSize: 12, fontFamily: "monospace", marginTop: 2 },
  totalsBlock: { paddingTop: spacing.sm },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalLabel: { color: colors.textMuted, fontSize: 12 },
  totalLabelBold: { color: colors.text, fontWeight: "700", fontSize: 13 },
  totalMuted: { color: colors.textMuted, fontSize: 12, fontFamily: "monospace" },
  totalValue: { color: colors.primary, fontWeight: "700", fontSize: 13, fontFamily: "monospace" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: 4 },
  fileChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, padding: spacing.sm, maxWidth: 140 },
  fileChipText: { color: colors.primary, fontSize: 11 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { flex: 1 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm,
    color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm, fontSize: 14, minHeight: 70, textAlignVertical: "top",
  },
});
