"use client";

import { useMemo, useRef, useState } from "react";
import type { PredictedPoint, PricePoint } from "@/lib/api";

export type CompareSeries = {
  symbol: string;
  color: string;
  data: PricePoint[]; // most-recent-first, as returned by the API
  predicted: PredictedPoint[]; // chronological, continuing from the last actual point
};

type Props = {
  series: CompareSeries[];
  height?: number;
};

const MARGIN = { top: 16, right: 12, bottom: 24, left: 8 };

type Mode = "pct" | "abs";

const fmtINR = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function seriesPoints(s: CompareSeries) {
  const points = [...s.data].reverse();
  const totalPoints = points.length + s.predicted.length;
  return { points, totalPoints };
}

export default function CompareChart({ series, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [mode, setMode] = useState<Mode>("pct");
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);

  // Each series is plotted at its own fractional position (index / (length - 1))
  // rather than by wall-clock timestamp — symbols can have very different
  // history lengths since their scrapers start on demand per symbol. This
  // aligns series by "how far into its own history", which is good enough
  // for a visual comparison but is not true calendar-time alignment.
  const prepared = useMemo(
    () =>
      series.map((s) => {
        const { points, totalPoints } = seriesPoints(s);
        const base = points[0]?.price || null;
        const valueAt = (price: number) => (mode === "pct" && base ? ((price - base) / base) * 100 : price);
        return { ...s, points, totalPoints, base, valueAt };
      }),
    [series, mode]
  );

  const visible = prepared.filter((s) => s.points.length > 0);

  const { min, max } = useMemo(() => {
    const all: number[] = [];
    visible.forEach((s) => {
      s.points.forEach((p) => all.push(s.valueAt(p.price)));
      s.predicted.forEach((p) => all.push(s.valueAt(p.price)));
    });
    if (all.length === 0) return { min: 0, max: 1 };
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    if (hi - lo < Math.max(Math.abs(hi), 1) * 1e-4) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.1;
    return { min: lo - pad, max: hi + pad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const yAt = (v: number) => innerH - ((v - min) / (max - min)) * innerH;
  const xAtFrac = (frac: number) => frac * innerW;

  function pathFor(s: (typeof prepared)[number]) {
    if (s.points.length === 0) return { line: "", predicted: "" };
    const xFrac = (i: number) => (s.totalPoints <= 1 ? 0.5 : i / (s.totalPoints - 1));
    const line = s.points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"}${xAtFrac(xFrac(i)).toFixed(2)},${yAt(s.valueAt(p.price)).toFixed(2)}`
      )
      .join(" ");
    let predicted = "";
    if (s.predicted.length > 0) {
      const startIdx = s.points.length - 1;
      const last = s.points[startIdx];
      predicted = `M${xAtFrac(xFrac(startIdx)).toFixed(2)},${yAt(s.valueAt(last.price)).toFixed(2)}`;
      s.predicted.forEach((p, i) => {
        predicted += ` L${xAtFrac(xFrac(startIdx + 1 + i)).toFixed(2)},${yAt(s.valueAt(p.price)).toFixed(2)}`;
      });
    }
    return { line, predicted };
  }

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverFrac(Math.min(Math.max(x / innerW, 0), 1));
  }

  if (visible.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Waiting for data…
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: "100%" }}
      onMouseEnter={() => {
        if (containerRef.current) setWidth(containerRef.current.clientWidth);
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {prepared.map((s) => {
            const last = s.points[s.points.length - 1];
            const first = s.points[0];
            if (!last || !first) {
              return (
                <div key={s.symbol} style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: s.color,
                      marginRight: 6,
                    }}
                  />
                  {s.symbol} — no data yet
                </div>
              );
            }
            const delta = last.price - first.price;
            const deltaPct = first.price !== 0 ? (delta / first.price) * 100 : 0;
            const deltaColor = delta >= 0 ? "var(--good)" : "var(--critical)";
            return (
              <div key={s.symbol} style={{ fontSize: 12, display: "flex", alignItems: "baseline", gap: 6 }}>
                <span
                  style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: s.color }}
                />
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.symbol}</span>
                <span style={{ color: "var(--text-secondary)" }}>{fmtINR(last.price)}</span>
                <span style={{ color: deltaColor, fontWeight: 600 }}>
                  {deltaPct >= 0 ? "+" : ""}
                  {deltaPct.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden" }}>
          {(["pct", "abs"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 10px",
                border: "none",
                background: mode === m ? "var(--series-1)" : "var(--page-plane)",
                color: mode === m ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {m === "pct" ? "% change" : "Absolute ₹"}
            </button>
          ))}
        </div>
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Overlaid price comparison for selected symbols"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={0}
              x2={innerW}
              y1={innerH * t}
              y2={innerH * t}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
          ))}

          {mode === "pct" && (
            <line x1={0} x2={innerW} y1={yAt(0)} y2={yAt(0)} stroke="var(--baseline)" strokeWidth={1} strokeDasharray="2 3" />
          )}

          {visible.map((s) => {
            const { line, predicted } = pathFor(s);
            return (
              <g key={s.symbol}>
                <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {predicted && (
                  <path
                    d={predicted}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray="2 4"
                    opacity={0.55}
                  />
                )}
              </g>
            );
          })}

          {hoverFrac !== null && (
            <line x1={xAtFrac(hoverFrac)} x2={xAtFrac(hoverFrac)} y1={0} y2={innerH} stroke="var(--baseline)" strokeWidth={1} />
          )}

          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverFrac(null)}
          />
        </g>
      </svg>

      {hoverFrac !== null && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, marginTop: 4 }}>
          {visible.map((s) => {
            const idx = Math.min(Math.max(Math.round(hoverFrac * (s.totalPoints - 1)), 0), s.points.length - 1);
            const p = s.points[idx];
            if (!p) return null;
            return (
              <div key={s.symbol} style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: s.color, fontWeight: 600 }}>{s.symbol}</span> {fmtINR(p.price)}
                {mode === "pct" && s.base ? ` (${s.valueAt(p.price) >= 0 ? "+" : ""}${s.valueAt(p.price).toFixed(2)}%)` : ""}
                {" · "}
                {new Date(p.time).toLocaleString()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
