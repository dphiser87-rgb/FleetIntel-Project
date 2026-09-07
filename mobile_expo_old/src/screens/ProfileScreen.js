import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { Screen, Card, Overline, Button } from "../components/ui";
import { ROLE_LABEL } from "../lib/access";
import { colors, spacing } from "../lib/theme";

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <Screen style={styles.screen}>
      <Overline>Signed in as</Overline>
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <Card style={styles.card}>
        <Overline>Role</Overline>
        <Text style={styles.value}>{ROLE_LABEL[user?.role] || user?.role}</Text>
      </Card>

      <Button title="Sign out" variant="outline" onPress={logout} style={styles.logout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, paddingTop: spacing.xxl },
  name: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 2 },
  email: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  card: { marginBottom: spacing.lg },
  value: { color: colors.text, fontSize: 15, marginTop: 4 },
  logout: { marginTop: spacing.lg },
});
