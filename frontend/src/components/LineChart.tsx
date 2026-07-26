"use client";

import { useMemo, useRef, useState } from "react";
import type { PredictedPoint, PricePoint } from "@/lib/api";

type Props = {
  data: PricePoint[]; // most-recent-first, as returned by the API
  color: string;
  height?: number;
  predicted?: PredictedPoint[]; // chronological, continuing from the last actual point
};

const MARGIN = { top: 16, right: 12, bottom: 24, left: 8 };

export default function LineChart({ data, color, height = 220, predicted = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // chronological order for plotting
  const points = useMemo(() => [...data].reverse(), [data]);
  const totalPoints = points.length + predicted.length;

  const { min, max } = useMemo(() => {
    const allPrices = [...points.map((p) => p.price), ...predicted.map((p) => p.price)];
    if (allPrices.length === 0) return { min: 0, max: 1 };
    let lo = Math.min(...allPrices);
    let hi = Math.max(...allPrices);
    // Treat "effectively flat" (within 0.01% of the price, e.g. float noise
    // from an upstream calculation) the same as "exactly flat" — otherwise a
    // near-zero range gets stretched to fill the full chart height, turning
    // an imperceptible price difference into a misleading vertical spike.
    if (hi - lo < Math.max(Math.abs(hi), 1) * 1e-4) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.1;
    return { min: lo - pad, max: hi + pad };
  }, [points, predicted]);

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const xAt = (i: number) =>
    totalPoints <= 1 ? innerW / 2 : (i / (totalPoints - 1)) * innerW;
  const yAt = (price: number) =>
    innerH - ((price - min) / (max - min)) * innerH;

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)},${yAt(p.price).toFixed(2)}`)
      .join(" ");
  }, [points, innerW, innerH, min, max, totalPoints]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    return `${linePath} L${xAt(points.length - 1).toFixed(2)},${innerH} L${xAt(0).toFixed(2)},${innerH} Z`;
  }, [linePath, points, innerW, innerH, totalPoints]);

  const predictedPath = useMemo(() => {
    if (points.length === 0 || predicted.length === 0) return "";
    const last = points[points.length - 1];
    const startIdx = points.length - 1;
    let d = `M${xAt(startIdx).toFixed(2)},${yAt(last.price).toFixed(2)}`;
    predicted.forEach((p, i) => {
      d += ` L${xAt(startIdx + 1 + i).toFixed(2)},${yAt(p.price).toFixed(2)}`;
    });
    return d;
  }, [points, predicted, innerW, innerH, totalPoints]);

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (points.length === 0) return;
    const idx = Math.round((x / innerW) * (totalPoints - 1));
    setHoverIndex(Math.min(Math.max(idx, 0), points.length - 1));
  }

  if (points.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
        Waiting for first data point…
      </div>
    );
  }

  const hover = hoverIndex !== null ? points[hoverIndex] : null;
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last.price - first.price;
  const deltaPct = first.price !== 0 ? (delta / first.price) * 100 : 0;
  const deltaColor = delta >= 0 ? "var(--good)" : "var(--critical)";

  const fmtINR = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      ref={containerRef}
      style={{ width: "100%" }}
      onMouseEnter={() => {
        if (containerRef.current) setWidth(containerRef.current.clientWidth);
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>
          {fmtINR(last.price)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: deltaColor }}>
          {delta >= 0 ? "+" : ""}
          {fmtINR(delta)} ({deltaPct >= 0 ? "+" : ""}
          {deltaPct.toFixed(2)}%)
        </span>
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Price over time, with a projected trend"
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

          <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {predictedPath && (
            <path
              d={predictedPath}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="2 4"
              opacity={0.55}
            />
          )}

          {/* end marker on the last actual point */}
          <circle cx={xAt(points.length - 1)} cy={yAt(last.price)} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />

          {predicted.length > 0 && (
            <text
              x={xAt(totalPoints - 1)}
              y={yAt(predicted[predicted.length - 1].price) - 8}
              textAnchor="end"
              fontSize={10}
              fill="var(--text-muted)"
            >
              projected
            </text>
          )}

          {hover && hoverIndex !== null && (
            <>
              <line
                x1={xAt(hoverIndex)}
                x2={xAt(hoverIndex)}
                y1={0}
                y2={innerH}
                stroke="var(--baseline)"
                strokeWidth={1}
              />
              <circle cx={xAt(hoverIndex)} cy={yAt(hover.price)} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
            </>
          )}

          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
          />
        </g>
      </svg>

      {hover && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{new Date(hover.time).toLocaleString()}</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fmtINR(hover.price)}</span>
        </div>
      )}
    </div>
  );
}
