"use client";

import { useEffect, useRef, useState } from "react";
import { api, type SymbolSuggestion } from "@/lib/api";
import { inputStyle } from "./UserPanel";

const DEBOUNCE_MS = 250;

export default function SymbolAutocomplete({
  onSelect,
  placeholder,
  userId,
}: {
  onSelect: (suggestion: SymbolSuggestion) => void;
  placeholder?: string;
  userId?: string;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.searchSymbols(query.trim(), userId);
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function choose(suggestion: SymbolSuggestion) {
    onSelect(suggestion);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        e.preventDefault();
        choose({ symbol: query.trim().toUpperCase(), name: null, exchange: null });
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
      choose(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1 }}>
      <input
        style={{ ...inputStyle, width: "100%" }}
        placeholder={placeholder ?? "Search by name or symbol… e.g. tata consultancy"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {open && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            maxHeight: 260,
            overflowY: "auto",
            listStyle: "none",
            margin: 0,
            padding: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.symbol}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                cursor: "pointer",
                background: i === activeIndex ? "var(--page-plane)" : "transparent",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "baseline",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                <strong>{s.symbol}</strong>
                {s.name && <span style={{ color: "var(--text-secondary)" }}> — {s.name}</span>}
              </span>
              {s.exchange && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {s.exchange}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
