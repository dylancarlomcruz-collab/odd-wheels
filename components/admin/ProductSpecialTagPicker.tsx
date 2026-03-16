"use client";

import * as React from "react";
import {
  PRODUCT_SPECIAL_TAG_OPTIONS,
  getProductSpecialTagLabel,
  normalizeProductSpecialTags,
  type ProductSpecialTag,
} from "@/lib/productTags";

const TAG_BUTTON_TONES: Record<ProductSpecialTag, string> = {
  exclusive:
    "border-cyan-400/50 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20",
  limited_edition:
    "border-amber-400/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/20",
  chase: "border-rose-400/50 bg-rose-500/15 text-rose-100 hover:bg-rose-500/20",
  rare: "border-violet-400/50 bg-violet-500/15 text-violet-100 hover:bg-violet-500/20",
  new_release:
    "border-emerald-400/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20",
  discontinued:
    "border-zinc-400/50 bg-zinc-500/15 text-zinc-100 hover:bg-zinc-500/20",
};

type ProductSpecialTagPickerProps = {
  value: ReadonlyArray<string | null | undefined> | null | undefined;
  onChange: (next: ProductSpecialTag[]) => void;
  disabled?: boolean;
};

export function ProductSpecialTagPicker({
  value,
  onChange,
  disabled = false,
}: ProductSpecialTagPickerProps) {
  const selected = React.useMemo(
    () => normalizeProductSpecialTags(value),
    [value]
  );
  const hasTags = selected.length > 0;

  function toggle(tag: ProductSpecialTag) {
    const next = selected.includes(tag)
      ? selected.filter((value) => value !== tag)
      : [...selected, tag];
    onChange(normalizeProductSpecialTags(next));
  }

  function clearTags() {
    onChange([]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={!hasTags}
        onClick={clearTags}
        className={[
          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50",
          hasTags
            ? "border-white/10 bg-paper/5 text-white/70 hover:bg-paper/10 hover:text-white"
            : "border-white/30 bg-white/10 text-white",
        ].join(" ")}
      >
        No tags
      </button>
      {PRODUCT_SPECIAL_TAG_OPTIONS.map((option) => {
        const isSelected = selected.includes(option.key);
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => toggle(option.key)}
            className={[
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50",
              isSelected
                ? TAG_BUTTON_TONES[option.key]
                : "border-white/10 bg-paper/5 text-white/70 hover:bg-paper/10 hover:text-white",
            ].join(" ")}
          >
            {getProductSpecialTagLabel(option.key)}
          </button>
        );
      })}
    </div>
  );
}
