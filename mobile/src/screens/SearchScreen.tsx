import React, { useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api, SymbolSuggestion } from "../api";
import { colors } from "../theme";

export default function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout>;
  const onChangeText = (text: string) => {
    setQuery(text);
    clearTimeout(debounceTimer);
    if (text.trim().length < 1) {
      setResults([]);
      return;
    }
    debounceTimer = setTimeout(() => runSearch(text), 350);
  };

  const runSearch = async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchSymbols(q);
      setResults(res);
    } catch {
      setError("Search failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const addToPortfolio = async (item: SymbolSuggestion) => {
    setAdding(item.symbol);
    try {
      await api.updatePortfolio([{ symbol: item.symbol, name: item.name ?? undefined }]);
      navigation.goBack();
    } catch {
      setError("Couldn't add that stock. Try again.");
    } finally {
      setAdding(null);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search symbol or company name"
        placeholderTextColor={colors.muted}
        autoFocus
        value={query}
        onChangeText={onChangeText}
        autoCapitalize="characters"
      />
      {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={results}
        keyExtractor={(item) => item.symbol}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
            >
              <Text style={styles.symbol}>{item.symbol}</Text>
              {item.name ? <Text style={styles.name}>{item.name}</Text> : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.addButton} onPress={() => addToPortfolio(item)} disabled={adding === item.symbol}>
              <Text style={styles.addButtonText}>{adding === item.symbol ? "..." : "+ Add"}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60, paddingHorizontal: 16 },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    color: colors.text,
    marginBottom: 12,
  },
  error: { color: colors.danger, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  symbol: { color: colors.text, fontWeight: "700", fontSize: 16 },
  name: { color: colors.muted, fontSize: 13, marginTop: 2 },
  addButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  addButtonText: { color: "#06231a", fontWeight: "700" },
});
