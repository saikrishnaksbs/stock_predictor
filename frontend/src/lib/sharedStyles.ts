import type { CSSProperties } from "react";

export const panelStyle: CSSProperties = {
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

export const headingStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 12,
  color: "var(--text-primary)",
};

export const labelStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
};

export const inputStyle: CSSProperties = {
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--page-plane)",
  color: "var(--text-primary)",
  outline: "none",
};

export const buttonStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "var(--series-1)",
  color: "#ffffff",
  cursor: "pointer",
};
