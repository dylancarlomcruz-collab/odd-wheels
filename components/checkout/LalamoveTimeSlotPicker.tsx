"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type LalamoveWindowKey = "08_12" | "12_15" | "15_18" | "18_21";

export type LalamoveSelection = {
  date: string;
  window_key: LalamoveWindowKey;
  window_label: string;
};

export const LALAMOVE_WINDOWS = [
  { key: "08_12", label: "8:00 AM - 12:00 PM" },
  { key: "12_15", label: "12:00 PM - 3:00 PM" },
  { key: "15_18", label: "3:00 PM - 6:00 PM" },
  { key: "18_21", label: "6:00 PM - 9:00 PM" },
] as const;

type DateOption = {
  date: string;
  label: string;
  summaryLabel: string;
};

function buildDateOptions(days: number): DateOption[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  });
  const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  const summaryFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return Array.from({ length: days }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const date = `${y}-${m}-${dd}`;
    const monthDay = monthDayFormatter.format(d);
    const label =
      i === 0
        ? `Today (${monthDay})`
        : `${weekdayFormatter.format(d)} (${monthDay})`;
    return { date, label, summaryLabel: summaryFormatter.format(d) };
  });
}

function formatSummaryDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function LalamoveTimeSlotPicker({
  value,
  onChange,
  days = 7,
  helperText,
  error,
}: {
  value: LalamoveSelection[];
  onChange: (value: LalamoveSelection[]) => void;
  days?: number;
  helperText?: string;
  error?: string | null;
}) {
  const [selectedDate, setSelectedDate] = React.useState("");

  const dateOptions = React.useMemo(() => buildDateOptions(days), [days]);

  React.useEffect(() => {
    if (!value.length) return;
    if (!selectedDate) setSelectedDate(value[0].date);
  }, [value, selectedDate]);

  const selectedDateSummary =
    dateOptions.find((d) => d.date === selectedDate)?.summaryLabel ??
    (selectedDate ? formatSummaryDate(selectedDate) : "");

  function handleDatePick(date: string) {
    setSelectedDate(date);
  }

  function handleWindowPick(window: (typeof LALAMOVE_WINDOWS)[number]) {
    if (!selectedDate) return;
    const exists = value.some(
      (slot) => slot.date === selectedDate && slot.window_key === window.key
    );
    if (exists) {
      onChange(
        value.filter(
          (slot) =>
            slot.date !== selectedDate || slot.window_key !== window.key
        )
      );
      return;
    }
    onChange([
      ...value,
      { date: selectedDate, window_key: window.key, window_label: window.label },
    ]);
  }

  function handleRemoveSlot(slotToRemove: LalamoveSelection) {
    onChange(
      value.filter(
        (slot) =>
          slot.date !== slotToRemove.date ||
          slot.window_key !== slotToRemove.window_key
      )
    );
  }

  const summary = value.length
    ? `Selected: ${value.length} slot${value.length === 1 ? "" : "s"}`
    : selectedDate
    ? `Selected: ${selectedDateSummary} - Tap a time window to add`
    : "Selected: None";

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">When can you receive?</div>
        <div className="text-xs text-white/60">
          Multi-select dates and time windows. Tap a time window to add or remove it.
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-white/50">
          Step 1
        </div>
        <div className="text-sm font-medium text-white/80">Choose a date</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {dateOptions.map((d) => {
            const isActive = d.date === selectedDate;
            const isSelected = value.some((slot) => slot.date === d.date);
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => handleDatePick(d.date)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                  isActive
                    ? "border-accent-400/80 bg-accent-500/10 text-white"
                    : isSelected
                    ? "border-accent-400/40 bg-bg-900/30 text-white/80"
                    : "border-white/10 bg-bg-900/20 text-white/70 hover:border-white/30"
                )}
              >
                <div>{d.label}</div>
                {isSelected ? (
                  <div className="text-[10px] uppercase tracking-wide text-accent-700 dark:text-accent-200">
                    Added
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-white/50">
          Step 2
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-white/80">
            Choose a time window
          </div>
          {!selectedDate ? (
            <span className="text-xs text-white/50">Select a date first</span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LALAMOVE_WINDOWS.map((window) => {
            const isActive =
              Boolean(selectedDate) &&
              value.some(
                (slot) =>
                  slot.date === selectedDate && slot.window_key === window.key
              );
            return (
              <button
                key={window.key}
                type="button"
                disabled={!selectedDate}
                onClick={() => handleWindowPick(window)}
                aria-pressed={isActive}
                className={cn(
                  "relative flex w-full items-center justify-center rounded-full border px-3 py-2 text-xs font-medium transition",
                  isActive
                    ? "border-accent-400/70 text-white shadow-[0_0_0_1px_rgba(217,106,43,.25)]"
                    : "border-white/10 text-white/75 hover:border-white/30",
                  !selectedDate && "cursor-not-allowed opacity-50"
                )}
              >
                <span
                  className={cn(
                    "absolute left-4 h-2 w-2 rounded-full bg-accent-400 transition",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                />
                {window.label}
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-white/60">
          You can select multiple dates and multiple time windows.
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-white/50">
          Selected
        </div>
        <div className="rounded-xl border border-white/10 bg-bg-900/20 p-3 text-xs text-white/70">
          {value.length ? (
            <div className="flex flex-wrap gap-2">
              {value.map((slot) => (
                <button
                  key={`${slot.date}-${slot.window_key}`}
                  type="button"
                  onClick={() => handleRemoveSlot(slot)}
                  className="flex items-center gap-2 rounded-full border border-white/15 bg-bg-900/40 px-3 py-1 text-xs text-white/80 hover:border-white/30"
                  title="Remove slot"
                >
                  <span>{formatSummaryDate(slot.date)}</span>
                  <span>{slot.window_label}</span>
                  <span className="text-white/50">x</span>
                </button>
              ))}
            </div>
          ) : (
            <div>No slots selected yet.</div>
          )}
        </div>
        <div className="text-xs text-white/70">{summary}</div>
      </div>

      {helperText ? (
        <div className="text-xs text-white/60">{helperText}</div>
      ) : null}
      {error ? <div className="text-xs text-red-200">{error}</div> : null}
    </div>
  );
}
