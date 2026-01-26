"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type LalamoveWindowKey =
  | "08_12"
  | "12_15"
  | "15_18"
  | "18_21"
  | "BUSINESS_HOURS"
  | "ANYTIME"
  | "CUSTOM";

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
  { key: "BUSINESS_HOURS", label: "Business hours" },
  { key: "ANYTIME", label: "Anytime" },
  { key: "CUSTOM", label: "Custom time" },
] as const;

const DATE_MODES = [
  { key: "WEEKDAYS", label: "Weekdays" },
  { key: "WEEKENDS", label: "Weekends" },
  { key: "CUSTOM", label: "Pick available days" },
] as const;

const TIME_MODES = [
  { key: "BUSINESS_HOURS", label: "Business hours" },
  { key: "ANYTIME", label: "Anytime" },
  { key: "CUSTOM", label: "Pick a time" },
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

type DateModeKey = (typeof DATE_MODES)[number]["key"];
type TimeModeKey = (typeof TIME_MODES)[number]["key"];

function isWeekendDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayIndex = date.getDay();
  return dayIndex === 0 || dayIndex === 6;
}

function buildTimeLabel(
  mode: TimeModeKey,
  customStart: string,
  customEnd: string
) {
  if (mode === "CUSTOM") {
    const start = customStart.trim();
    const end = customEnd.trim();
    if (start && end) return `${start} - ${end}`;
    return "Custom time";
  }
  return TIME_MODES.find((option) => option.key === mode)?.label ?? mode;
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
  const [dateMode, setDateMode] = React.useState<DateModeKey | "">("");
  const [timeMode, setTimeMode] = React.useState<TimeModeKey>("BUSINESS_HOURS");
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");

  const dateOptions = React.useMemo(() => buildDateOptions(days), [days]);
  const weekdayDates = React.useMemo(
    () => dateOptions.filter((d) => !isWeekendDate(d.date)).map((d) => d.date),
    [dateOptions]
  );
  const weekendDates = React.useMemo(
    () => dateOptions.filter((d) => isWeekendDate(d.date)).map((d) => d.date),
    [dateOptions]
  );

  const selectedDates = React.useMemo(() => {
    const unique = new Set(value.map((slot) => slot.date));
    return Array.from(unique);
  }, [value]);

  React.useEffect(() => {
    if (!value.length) return;
    const firstKey = value[0]?.window_key as TimeModeKey | undefined;
    if (firstKey && TIME_MODES.some((option) => option.key === firstKey)) {
      setTimeMode(firstKey);
      if (firstKey !== "CUSTOM") return;
    } else {
      setTimeMode("CUSTOM");
    }
    const label = value[0]?.window_label ?? "";
    if (label.includes(" - ")) {
      const [start, end] = label.split(" - ").map((part) => part.trim());
      setCustomStart(start);
      setCustomEnd(end);
    }
  }, [value]);

  React.useEffect(() => {
    if (value.length || dateMode) return;
    if (!selectedDates.length) return;
    const allWeekdays = selectedDates.every((d) => !isWeekendDate(d));
    const allWeekends = selectedDates.every((d) => isWeekendDate(d));
    if (allWeekdays) setDateMode("WEEKDAYS");
    else if (allWeekends) setDateMode("WEEKENDS");
    else setDateMode("CUSTOM");
  }, [value.length, dateMode, selectedDates]);

  function setSlotsForDates(dates: string[]) {
    if (!dates.length) {
      onChange([]);
      return;
    }
    const label = buildTimeLabel(timeMode, customStart, customEnd);
    onChange(
      dates.map((date) => ({
        date,
        window_key: timeMode,
        window_label: label,
      }))
    );
  }

  function handleDateModePick(mode: DateModeKey) {
    setDateMode(mode);
    if (mode === "WEEKDAYS") {
      setSlotsForDates(weekdayDates);
      return;
    }
    if (mode === "WEEKENDS") {
      setSlotsForDates(weekendDates);
      return;
    }
  }

  function handleCustomDateToggle(date: string) {
    const exists = selectedDates.includes(date);
    const nextDates = exists
      ? selectedDates.filter((d) => d !== date)
      : [...selectedDates, date];
    setSlotsForDates(nextDates);
  }

  function handleTimeModePick(mode: TimeModeKey) {
    setTimeMode(mode);
    if (!selectedDates.length) return;
    setSlotsForDates(selectedDates);
  }

  function handleRemoveSlot(slotToRemove: LalamoveSelection) {
    const nextDates = selectedDates.filter((d) => d !== slotToRemove.date);
    setSlotsForDates(nextDates);
  }

  const summary = selectedDates.length
    ? `Selected: ${selectedDates.length} day${
        selectedDates.length === 1 ? "" : "s"
      } - ${buildTimeLabel(timeMode, customStart, customEnd)}`
    : "Selected: None";
  const dateModeLabel =
    DATE_MODES.find((option) => option.key === dateMode)?.label ?? "";

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">When can you receive?</div>
        <div className="text-xs text-white/60">
          Share your availability and time preference.
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-white/50">
          Step 1
        </div>
        <div className="text-sm font-medium text-white/80">
          Choose available days
        </div>
        <div className="flex flex-wrap gap-2">
          {DATE_MODES.map((option) => {
            const isActive = option.key === dateMode;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => handleDateModePick(option.key)}
                className={cn(
                  "rounded-full border px-3 py-2 text-xs font-medium transition",
                  isActive
                    ? "border-accent-400/70 bg-accent-500/10 text-white"
                    : "border-white/10 text-white/70 hover:border-white/30"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {dateMode === "CUSTOM" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {dateOptions.map((d) => {
              const isSelected = selectedDates.includes(d.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => handleCustomDateToggle(d.date)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                    isSelected
                      ? "border-accent-400/70 bg-accent-500/10 text-white"
                      : "border-white/10 bg-bg-900/20 text-white/70 hover:border-white/30"
                  )}
                >
                  <div>{d.label}</div>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="text-[11px] text-white/60">
          {dateMode === "CUSTOM"
            ? "Tap any day to add or remove it."
            : dateMode
            ? `${dateModeLabel} covers the next ${days} days.`
            : "Choose a day range to continue."}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-white/50">
          Step 2
        </div>
        <div className="text-sm font-medium text-white/80">
          Choose hours
        </div>
        <div className="flex flex-wrap gap-2">
          {TIME_MODES.map((option) => {
            const isActive = option.key === timeMode;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => handleTimeModePick(option.key)}
                className={cn(
                  "rounded-full border px-3 py-2 text-xs font-medium transition",
                  isActive
                    ? "border-accent-400/70 bg-accent-500/10 text-white"
                    : "border-white/10 text-white/70 hover:border-white/30"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {timeMode === "CUSTOM" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                if (selectedDates.length) setSlotsForDates(selectedDates);
              }}
              placeholder="Start time"
              className="w-full rounded-xl border border-white/10 bg-bg-900/20 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent-500/60"
            />
            <input
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                if (selectedDates.length) setSlotsForDates(selectedDates);
              }}
              placeholder="End time"
              className="w-full rounded-xl border border-white/10 bg-bg-900/20 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent-500/60"
            />
          </div>
        ) : null}
        {timeMode === "BUSINESS_HOURS" ? (
          <div className="text-[11px] text-white/50">
            Business hours: 9:00 AM - 5:00 PM.
          </div>
        ) : null}
        <div className="text-[11px] text-white/60">
          Applies to all selected days.
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
