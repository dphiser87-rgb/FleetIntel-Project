import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card, Badge, Overline, Button, EmptyState } from "../components/ui";
import PendingSyncBadge from "../components/PendingSyncBadge";
import { colors, spacing } from "../lib/theme";
import { getCachedDefects, runSync } from "../lib/sync";

const SEVERITY_TONE = { low: "muted", medium: "primary", high: "warning", critical: "danger" };

export default function DefectsScreen({ navigation }) {
  const [defects, setDefects] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const cached = await getCachedDefects();
    cached.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setDefects(cached);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await runSync();
    await load();
    setRefreshing(false);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Overline>Reported issues</Overline>
          <Text style={styles.title}>Defects</Text>
        </View>
        <PendingSyncBadge />
      </View>
      <View style={styles.newButtonWrap}>
        <Button title="Report defect" onPress={() => navigation.navigate("NewDefect")} />
      </View>
      <FlatList
        data={defects}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState text="No defects reported." />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.category}>{item.category}</Text>
              <Badge label={item.severity} tone={SEVERITY_TONE[item.severity] || "muted"} />
            </View>
            <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
            <Text style={styles.meta}>{item.status}</Text>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    padding: spacing.lg, paddingTop: spacing.xxl,
  },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginTop: 2 },
  newButtonWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  card: { marginBottom: spacing.sm },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  category: { color: colors.text, fontSize: 14, fontWeight: "700", textTransform: "capitalize" },
  description: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs, textTransform: "uppercase" },
});
