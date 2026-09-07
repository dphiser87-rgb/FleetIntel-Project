import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { colors, spacing } from "../lib/theme";

export function Screen({ children, style }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return <Wrapper style={[styles.card, style]} onPress={onPress}>{children}</Wrapper>;
}

export function Button({ title, onPress, variant = "primary", disabled, loading, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, variant === "outline" && styles.buttonOutline, (disabled || loading) && styles.buttonDisabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? colors.primary : "#fff"} />
      ) : (
        <Text style={[styles.buttonText, variant === "outline" && styles.buttonTextOutline]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Badge({ label, tone = "muted" }) {
  const toneColor = { success: colors.success, warning: colors.warning, danger: colors.danger, primary: colors.primary, muted: colors.textMuted }[tone];
  return (
    <View style={[styles.badge, { borderColor: toneColor }]}>
      <Text style={[styles.badgeText, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

export function Overline({ children }) {
  return <Text style={styles.overline}>{children}</Text>;
}

export function EmptyState({ text }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing.lg },
  button: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  buttonOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 13, letterSpacing: 1, textTransform: "uppercase" },
  buttonTextOutline: { color: colors.text },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  overline: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", color: colors.textMuted },
  empty: { padding: spacing.xxl, alignItems: "center" },
  emptyText: { color: colors.textMuted, fontSize: 14 },
});
