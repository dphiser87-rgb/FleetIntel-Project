import React, { useCallback, useState } from "react";
import { View, Text, FlatList, TextInput, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card, Overline, EmptyState } from "../components/ui";
import { colors, spacing } from "../lib/theme";
import { getCachedVehicles, runSync } from "../lib/sync";

export default function VehiclesScreen({ navigation }) {
  const [vehicles, setVehicles] = useState([]);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const cached = await getCachedVehicles();
    cached.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setVehicles(cached);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await runSync();
    await load();
    setRefreshing(false);
  };

  const filtered = vehicles.filter((v) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (v.name || "").toLowerCase().includes(q) || (v.plate || "").toLowerCase().includes(q);
  });

  return (
    <Screen>
      <View style={styles.header}>
        <Overline>Fleet</Overline>
        <Text style={styles.title}>Vehicles</Text>
        <TextInput
          style={styles.search}
          placeholder="Search name or plate…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState text="No vehicles found." />}
        renderItem={({ item }) => (
          <Card style={styles.vCard} onPress={() => navigation.navigate("VehicleDetail", { vehicleId: item.id })}>
            <Text style={styles.vName}>{item.name}</Text>
            <Text style={styles.vMeta}>{item.plate} · {item.make} {item.model}</Text>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, paddingTop: spacing.xxl },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginTop: 2, marginBottom: spacing.md },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm,
    color: colors.text, fontSize: 14,
  },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  vCard: { marginBottom: spacing.sm },
  vName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  vMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
});
