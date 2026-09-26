import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { api, ApiError, Prediction, Sentiment, SentimentArticle, StockTimeSeries } from "../api";
import { colors } from "../theme";

export default function StockDetailScreen({ route }: any) {
  const { symbol, name } = route.params as { symbol: string; name?: string | null };

  const [timeSeries, setTimeSeries] = useState<StockTimeSeries | null>(null);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const stopScanRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopScanRef.current?.(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [tsResult, sentimentResult, predictionResult] = await Promise.allSettled([
        api.getTimeSeries(symbol, 200),
        api.getSentiment(symbol),
        api.getPrediction(symbol),
      ]);
      if (cancelled) return;
      if (tsResult.status === "fulfilled") setTimeSeries(tsResult.value);
      if (sentimentResult.status === "fulfilled") setSentiment(sentimentResult.value);
      if (predictionResult.status === "fulfilled") setPrediction(predictionResult.value);
      if (tsResult.status === "rejected" && tsResult.reason instanceof ApiError && tsResult.reason.status === 404) {
        setError("No price history yet for this stock.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const handleScan = () => {
    if (scanning) return;
    setScanning(true);
    setScanCount(0);
    stopScanRef.current = api.streamSentimentScan(
      symbol,
      (article) => {
        setScanCount((c) => c + 1);
        setSentiment((prev) => {
          const base = prev ?? { symbol, avg_score: 0, article_count: 0, articles: [] };
          const articles = [article, ...base.articles];
          const avg_score = articles.reduce((sum, a) => sum + a.score, 0) / articles.length;
          return { ...base, articles, article_count: articles.length, avg_score };
        });
      },
      () => {
        setScanning(false);
        stopScanRef.current = null;
        api.getPrediction(symbol).then(setPrediction).catch(() => {});
      },
      () => {
        setScanning(false);
        stopScanRef.current = null;
      }
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const chartData = buildChartData(timeSeries);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.symbol}>{symbol}</Text>
      {name ? <Text style={styles.name}>{name}</Text> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {chartData ? (
        <LineChart
          data={chartData}
          width={Dimensions.get("window").width - 32}
          height={220}
          withDots={false}
          withInnerLines={false}
          chartConfig={{
            backgroundColor: colors.card,
            backgroundGradientFrom: colors.card,
            backgroundGradientTo: colors.card,
            decimalPlaces: 2,
            color: (opacity = 1) => `rgba(61, 220, 151, ${opacity})`,
            labelColor: () => colors.muted,
            propsForBackgroundLines: { stroke: colors.border },
          }}
          bezier
          style={styles.chart}
        />
      ) : null}

      {prediction ? (
        <Card title="Prediction">
          <Text style={styles.metric}>
            Trend slope: <Text style={styles.metricValue}>{prediction.trend_slope_per_point.toFixed(4)}</Text>
          </Text>
          {prediction.sentiment_adjusted_slope_per_point !== null ? (
            <Text style={styles.metric}>
              Sentiment-adjusted slope:{" "}
              <Text style={styles.metricValue}>{prediction.sentiment_adjusted_slope_per_point.toFixed(4)}</Text>
            </Text>
          ) : null}
          <Text style={styles.metric}>
            Method: <Text style={styles.metricValue}>{prediction.method}</Text>
          </Text>
        </Card>
      ) : null}

      <Card title="Sentiment">
        <View style={styles.sentimentHeader}>
          {sentiment && sentiment.article_count > 0 ? (
            <Text style={styles.metric}>
              Average score:{" "}
              <Text style={[styles.metricValue, { color: sentiment.avg_score >= 0 ? colors.accent : colors.danger }]}>
                {sentiment.avg_score.toFixed(2)}
              </Text>{" "}
              ({sentiment.article_count} articles)
            </Text>
          ) : (
            <Text style={styles.metric}>No articles yet.</Text>
          )}
          <TouchableOpacity onPress={handleScan} disabled={scanning}>
            <Text style={[styles.scanLink, scanning && { opacity: 0.6 }]}>
              {scanning ? `scanning… ${scanCount} new` : "scan latest news"}
            </Text>
          </TouchableOpacity>
        </View>

        {(sentiment?.articles ?? [])
          .slice()
          .sort((a, b) => articleTimestamp(b) - articleTimestamp(a))
          .map((article, i) => (
            <ArticleRow key={`${article.title}-${article.time}-${i}`} article={article} />
          ))}
      </Card>
    </ScrollView>
  );
}

function articleTimestamp(a: SentimentArticle): number {
  return a.published_at ? new Date(a.published_at).getTime() : -Infinity;
}

type PanelMode = "none" | "full" | "summary";

function ArticleRow({ article }: { article: SentimentArticle }) {
  const [mode, setMode] = useState<PanelMode>("none");
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [fullText, setFullText] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  const toggle = async (target: "full" | "summary") => {
    if (!article.url) return;
    if (mode === target) {
      setMode("none");
      return;
    }
    setMode(target);
    setPanelError(null);

    const already = target === "full" ? fullText : summary;
    if (already) return;

    setLoadingPanel(true);
    try {
      if (target === "full") {
        const res = await api.getArticleFullText(article.url);
        if (res.success && res.text) setFullText(res.text);
        else setPanelError(res.error ?? "Could not extract article text.");
      } else {
        const res = await api.getArticleSummary(article.url);
        if (res.success && res.summary) setSummary(res.summary);
        else setPanelError(res.error ?? "Could not summarize this article.");
      }
    } catch {
      setPanelError("Request failed — this can take a while and may time out.");
    } finally {
      setLoadingPanel(false);
    }
  };

  return (
    <View style={styles.articleRow}>
      <View style={styles.articleTop}>
        <Text style={[styles.articleScore, { color: article.score >= 0 ? colors.accent : colors.danger }]}>
          {article.score > 0 ? "+1" : article.score < 0 ? "−1" : "0"}
        </Text>
        <Text style={styles.articleTitle} numberOfLines={3}>
          {article.title}
        </Text>
      </View>
      <Text style={styles.articleMeta}>
        {article.source} · {fmtDate(article.published_at)}
      </Text>
      {article.url ? (
        <View style={styles.articleActions}>
          <TouchableOpacity onPress={() => toggle("summary")}>
            <Text style={styles.actionLink}>{mode === "summary" ? "hide summary" : "summarize"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggle("full")}>
            <Text style={styles.actionLink}>{mode === "full" ? "hide full text" : "read full text"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {mode !== "none" ? (
        <View style={styles.panel}>
          {loadingPanel ? (
            <Text style={styles.panelText}>
              {mode === "summary"
                ? "Summarizing (real page load + model call, ~15-30s)…"
                : "Loading full article (~10-20s)…"}
            </Text>
          ) : panelError ? (
            <Text style={[styles.panelText, { color: colors.danger }]}>{panelError}</Text>
          ) : (
            <Text style={styles.panelText}>{mode === "summary" ? summary : fullText}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "unknown date";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function buildChartData(ts: StockTimeSeries | null) {
  if (!ts || ts.data.length === 0) return null;
  const points = [...ts.data].reverse();
  const step = Math.max(1, Math.floor(points.length / 6));
  return {
    labels: points.map((p, i) => (i % step === 0 ? new Date(p.time).getDate().toString() : "")),
    datasets: [{ data: points.map((p) => p.price) }],
  };
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  symbol: { color: colors.text, fontSize: 26, fontWeight: "700" },
  name: { color: colors.muted, fontSize: 14, marginTop: 2, marginBottom: 12 },
  error: { color: colors.danger, marginBottom: 12 },
  chart: { borderRadius: 12, marginTop: 8, marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  cardTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 8 },
  metric: { color: colors.muted, marginBottom: 4, flexShrink: 1 },
  metricValue: { color: colors.text, fontWeight: "600" },
  sentimentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  scanLink: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  articleRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 10,
  },
  articleTop: { flexDirection: "row", gap: 8 },
  articleTitle: { color: colors.text, flex: 1, fontSize: 13 },
  articleScore: { fontWeight: "700", minWidth: 16 },
  articleMeta: { color: colors.muted, fontSize: 11, marginTop: 4, marginLeft: 24 },
  articleActions: { flexDirection: "row", gap: 16, marginTop: 6, marginLeft: 24 },
  actionLink: { color: colors.accent, fontSize: 11, textDecorationLine: "underline" },
  panel: {
    marginTop: 8,
    marginLeft: 24,
    padding: 10,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
  },
  panelText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
