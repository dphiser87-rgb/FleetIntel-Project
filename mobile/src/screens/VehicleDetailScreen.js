import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card, Overline, Button } from "../components/ui";
import { colors, spacing } from "../lib/theme";
import { getCachedVehicle } from "../lib/sync";

export default function VehicleDetailScreen({ route, navigation }) {
  const { vehicleId } = route.params;
  const [vehicle, setVehicle] = useState(null);

  useFocusEffect(useCallback(() => {
    getCachedVehicle(vehicleId).then(setVehicle);
  }, [vehicleId]));

  if (!vehicle) return <Screen style={styles.centered}><Text style={styles.muted}>Loading…</Text></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Overline>{vehicle.plate}</Overline>
        <Text style={styles.title}>{vehicle.name}</Text>
        <Text style={styles.subtitle}>{vehicle.make} {vehicle.model} · {vehicle.year}</Text>

        <Card style={styles.card}>
          <Overline>Odometer</Overline>
          <Text style={styles.value}>{vehicle.odometer ?? "—"} km</Text>
        </Card>
        <Card style={styles.card}>
          <Overline>Status</Overline>
          <Text style={styles.value}>{vehicle.status}</Text>
        </Card>

        <Button
          title="Start inspection"
          onPress={() => navigation.navigate("Inspection", { vehicleId: vehicle.id, vehicleName: vehicle.name })}
          style={styles.action}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  centered: { justifyContent: "center", alignItems: "center" },
  muted: { color: colors.textMuted },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, marginTop: 2 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  value: { color: colors.text, fontSize: 15, marginTop: 4 },
  action: { marginTop: spacing.lg },
});
