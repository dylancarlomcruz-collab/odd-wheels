"use client";

export function formatTitle(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      const match = word.match(/^([^A-Za-z0-9']*)([A-Za-z0-9']+)([^A-Za-z0-9']*)$/);
      if (!match) return word;
      const [, prefix, core, suffix] = match;
      if (!core) return word;
      if (core.toUpperCase() === core) return `${prefix}${core}${suffix}`;
      return `${prefix}${core.charAt(0).toUpperCase()}${core
        .slice(1)
        .toLowerCase()}${suffix}`;
    })
    .join(" ");
}
