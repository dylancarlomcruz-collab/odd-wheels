"use client";

export function formatTitle(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const cleaned = trimmed
    .replace(/\bdiecast\s+car\s+models?\b/gi, " ")
    .replace(/\bdiecast\s+model\s+cars?\b/gi, " ")
    .replace(/\bdiecast\s+models?\b/gi, " ")
    .replace(/\bdiecast\s+cars?\b/gi, " ")
    .replace(/\bdiecast\s+model\b/gi, " ")
    .replace(/\bdiecast\b/gi, " ")
    .replace(/\bmodel\s+cars?\b/gi, " ")
    .replace(/\bcar\s+models?\b/gi, " ")
    .replace(/\btoy\s+gift\b/gi, " ")
    .replace(/\btoy\b/gi, " ")
    .replace(/\bgift\b/gi, " ")
    .replace(/\bcollectible\b/gi, " ")
    .replace(/\bcollection\b/gi, " ")
    .replace(/\bLHD\b/gi, " ")
    .replace(/\bRHD\b/gi, " ")
    .replace(/\bleft\s+hand\s+drive\b/gi, " ")
    .replace(/\bright\s+hand\s+drive\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) return "";
  const stripped = cleaned
    .replace(/\(\s*\)/g, " ")
    .replace(/\[\s*\]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!stripped) return "";
  return stripped
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
