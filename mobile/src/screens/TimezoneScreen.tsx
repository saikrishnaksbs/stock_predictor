import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

export default function TimezoneScreen({ navigation }: any) {
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSelect = async (tz: string) => {
    setSaving(tz);
    setError(null);
    try {
      const updated = await api.updateTimezone(tz);
      setUser(updated);
      navigation.goBack();
    } catch {
      setError("Couldn't update timezone. Try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Current: {user?.timezone}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {TIMEZONES.map((tz) => (
        <TouchableOpacity
          key={tz}
          style={[styles.row, tz === user?.timezone && styles.rowActive]}
          onPress={() => onSelect(tz)}
          disabled={saving !== null}
        >
          <Text style={[styles.tzText, tz === user?.timezone && styles.tzTextActive]}>{tz}</Text>
          {saving === tz ? <ActivityIndicator color={colors.accent} size="small" /> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  label: { color: colors.muted, marginBottom: 16 },
  error: { color: colors.danger, marginBottom: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  rowActive: { borderColor: colors.accent },
  tzText: { color: colors.text },
  tzTextActive: { color: colors.accent, fontWeight: "700" },
});
