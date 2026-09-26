import React, { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, Portfolio } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

export default function DashboardScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await api.getPortfolio();
      setPortfolio(p);
      setError(null);
    } catch {
      setError("Couldn't load your portfolio. Pull to retry.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const stocks = portfolio?.stocks ?? [];
  const wishlist = portfolio?.wishlist ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hi, {user?.username}</Text>
          <Text style={styles.sub}>{stocks.length} tracked · {wishlist.length} watched</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <TouchableOpacity onPress={() => navigation.navigate("Timezone")}>
            <Text style={styles.timezone}>{user?.timezone}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.logout}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.searchButton} onPress={() => navigation.navigate("Search")}>
        <Text style={styles.searchButtonText}>+ Search &amp; add a stock</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={stocks}
        keyExtractor={(item) => item.symbol}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={<SectionLabel label="Portfolio" />}
        ListEmptyComponent={<Text style={styles.empty}>No stocks yet — search to add one.</Text>}
        renderItem={({ item }) => (
          <StockRow
            symbol={item.symbol}
            name={item.name}
            onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
          />
        )}
        ListFooterComponent={
          <>
            <SectionLabel label="Wishlist" />
            {wishlist.length === 0 ? (
              <Text style={styles.empty}>Stocks you search for show up here.</Text>
            ) : (
              wishlist.map((item) => (
                <StockRow
                  key={item.symbol}
                  symbol={item.symbol}
                  name={item.name}
                  onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
                />
              ))
            )}
          </>
        }
      />
    </View>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function StockRow({ symbol, name, onPress }: { symbol: string; name?: string | null; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View>
        <Text style={styles.symbol}>{symbol}</Text>
        {name ? <Text style={styles.name}>{name}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60, paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  hello: { fontSize: 22, fontWeight: "700", color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  logout: { color: colors.danger, fontWeight: "600" },
  timezone: { color: colors.accent, fontSize: 12, marginBottom: 6 },
  searchButton: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  searchButtonText: { color: colors.accent, fontWeight: "600", textAlign: "center" },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 12, marginBottom: 8 },
  empty: { color: colors.muted, paddingVertical: 12 },
  error: { color: colors.danger, marginBottom: 8 },
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
  symbol: { color: colors.text, fontWeight: "700", fontSize: 16 },
  name: { color: colors.muted, fontSize: 13, marginTop: 2 },
  chevron: { color: colors.muted, fontSize: 20 },
});
