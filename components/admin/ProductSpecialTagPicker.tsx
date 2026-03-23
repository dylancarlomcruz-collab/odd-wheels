"use client";

import * as React from "react";
import {
  PRODUCT_SPECIAL_TAG_OPTIONS,
  getProductSpecialTagLabel,
  getProductSpecialTagStyle,
  normalizeProductSpecialTags,
  type ProductSpecialTag,
} from "@/lib/productTags";

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
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-50",
              isSelected
                ? getProductSpecialTagStyle(option.key).pickerClassName
                : "border-white/10 bg-paper/5 text-white/70 hover:bg-paper/10 hover:text-white",
            ].join(" ")}
          >
            <span
              className={[
                "h-1.5 w-1.5 rounded-full transition",
                isSelected
                  ? "bg-white/95 shadow-[0_0_0_1px_rgba(255,255,255,0.42)]"
                  : "bg-white/35",
              ].join(" ")}
            />
            {getProductSpecialTagLabel(option.key)}
          </button>
        );
      })}
    </div>
  );
}
