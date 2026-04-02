"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import * as Flags from "country-flag-icons/react/3x2";
import { cn } from "@/lib/utils";
import {
  PHONE_COUNTRIES,
  getPhoneCountryByIso,
  matchesPhoneCountryQuery,
  type PhoneCountry,
} from "@/lib/phoneCountries";

type CountryCodePickerProps = {
  value: string;
  onChange: (country: PhoneCountry) => void;
  error?: string;
  disabled?: boolean;
};

type FlagComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

function CountryFlag({ iso2, className }: { iso2: string; className?: string }) {
  const Flag = (Flags as Record<string, FlagComponent>)[iso2];
  if (!Flag) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-4 w-6 items-center justify-center rounded-[4px] bg-white/10 text-[10px] font-semibold uppercase text-white/60",
          className
        )}
      >
        {iso2}
      </span>
    );
  }

  return (
    <Flag
      aria-hidden="true"
      focusable="false"
      className={cn("h-4 w-6 overflow-hidden rounded-[4px] shadow-sm", className)}
    />
  );
}

export function CountryCodePicker({
  value,
  onChange,
  error,
  disabled = false,
}: CountryCodePickerProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const deferredQuery = React.useDeferredValue(query);

  const selectedCountry =
    getPhoneCountryByIso(value) ?? getPhoneCountryByIso("PH") ?? PHONE_COUNTRIES[0];

  const filteredCountries = React.useMemo(() => {
    const results = PHONE_COUNTRIES.filter((country) =>
      matchesPhoneCountryQuery(country, deferredQuery)
    );
    return results.length > 0 ? results : PHONE_COUNTRIES;
  }, [deferredQuery]);

  React.useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const nextIndex = Math.max(
      0,
      filteredCountries.findIndex((country) => country.iso2 === selectedCountry.iso2)
    );
    setActiveIndex(nextIndex === -1 ? 0 : nextIndex);
  }, [filteredCountries, open, selectedCountry.iso2]);

  React.useEffect(() => {
    if (!open) return;
    const target = optionRefs.current[activeIndex];
    target?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function openPicker(initialQuery = "") {
    if (disabled) return;
    setQuery(initialQuery);
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  }

  function chooseCountry(country: PhoneCountry) {
    onChange(country);
    closePicker();
  }

  function moveActiveIndex(direction: 1 | -1) {
    setActiveIndex((current) => {
      if (!filteredCountries.length) return 0;
      const next = current + direction;
      if (next < 0) return filteredCountries.length - 1;
      if (next >= filteredCountries.length) return 0;
      return next;
    });
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closePicker() : openPicker())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openPicker();
            return;
          }

          if (/^[a-z]$/i.test(event.key)) {
            event.preventDefault();
            openPicker(event.key);
          }
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-bg-800 px-4 py-2 text-left text-white transition focus:outline-none focus:ring-2",
          error
            ? "border-red-500/60 focus:ring-red-500/40"
            : "border-white/10 focus:ring-accent-500/60",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-white/20"
        )}
      >
        <CountryFlag iso2={selectedCountry.iso2} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {selectedCountry.name}
        </span>
        <span className="shrink-0 text-sm font-medium text-white/55">
          {selectedCountry.dialCode}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-white/55 transition", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-bg-900/95 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/10 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveActiveIndex(1);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveActiveIndex(-1);
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const country = filteredCountries[activeIndex];
                    if (country) chooseCountry(country);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closePicker();
                    return;
                  }
                  if (event.key === "Home") {
                    event.preventDefault();
                    setActiveIndex(0);
                    return;
                  }
                  if (event.key === "End") {
                    event.preventDefault();
                    setActiveIndex(Math.max(0, filteredCountries.length - 1));
                  }
                }}
                type="text"
                placeholder="Search country or dial code"
                className="w-full rounded-xl border border-white/10 bg-bg-800 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-accent-500/60"
              />
            </div>
          </div>

          <div
            role="listbox"
            aria-label="Country code options"
            className="max-h-80 overflow-y-auto p-2"
          >
            {filteredCountries.map((country, index) => {
              const isSelected = country.iso2 === selectedCountry.iso2;
              const isActive = index === activeIndex;

              return (
                <button
                  key={`${country.iso2}-${country.dialCode}`}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => chooseCountry(country)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition",
                    isActive
                      ? "bg-accent-500/16 text-white"
                      : "text-white/80 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <CountryFlag iso2={country.iso2} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {country.name}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-white/50">
                    {country.dialCode}
                  </span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-accent-300" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
