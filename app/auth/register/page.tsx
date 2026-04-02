"use client";

import * as React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CountryCodePicker } from "@/components/auth/CountryCodePicker";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useRouter, useSearchParams } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import {
  formatPhoneForRegistrationError,
  getPhoneExampleLocalNumber,
  getPhoneLocalMaxLength,
  normalizePhoneInputForCountry,
  normalizePhoneForStorage,
} from "@/lib/phone";
import {
  findPhoneCountryFromInternationalPhone,
  getPhoneCountryByIso,
} from "@/lib/phoneCountries";

function RegisterContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const redirectParam = sp.get("redirect");
  const redirectTo =
    redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";
  const emailRedirectTo = "https://www.odd-wheels.com/";
  const [fullName, setFullName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [phoneCountryIso2, setPhoneCountryIso2] = React.useState("PH");
  const [contactNumber, setContactNumber] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [phoneTouched, setPhoneTouched] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const selectedPhoneCountry =
    getPhoneCountryByIso(phoneCountryIso2) ??
    getPhoneCountryByIso("PH")!;
  const normalizedCallingCode = selectedPhoneCountry.dialCode;
  const phonePlaceholder =
    getPhoneExampleLocalNumber(selectedPhoneCountry.iso2) || "Phone number";
  const phoneError = formatPhoneForRegistrationError(
    selectedPhoneCountry.iso2,
    contactNumber,
    phoneTouched || submitAttempted
  );

  React.useEffect(() => {
    setContactNumber((current) =>
      normalizePhoneInputForCountry(selectedPhoneCountry.iso2, current)
    );
  }, [selectedPhoneCountry.iso2]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitAttempted(true);

    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured. Fill .env.local first.");
      return;
    }

    if (!supabase) {
      setError("Supabase client not initialized. Check .env.local and restart dev server.");
      return;
    }

    const trimmedName = fullName.trim();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const submitPhoneError = formatPhoneForRegistrationError(
      selectedPhoneCountry.iso2,
      contactNumber,
      true
    );
    const normalizedContact = normalizePhoneForStorage(
      selectedPhoneCountry.iso2,
      normalizedCallingCode,
      contactNumber
    );

    if (!trimmedUsername || !normalizedContact || !trimmedEmail) {
      setError("Username, phone number, and email are required.");
      return;
    }
    if (submitPhoneError) {
      setError(submitPhoneError);
      return;
    }
    if (!acceptedTerms) {
      setError("Please accept the Terms of Service and Privacy Policy.");
      return;
    }

    const availabilityRes = await fetch("/api/auth/check-availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: trimmedUsername,
        contact_number: normalizedContact,
        email: trimmedEmail,
      }),
    });
    const availability = await availabilityRes.json().catch(() => null);
    if (!availabilityRes.ok || !availability?.ok) {
      setError(availability?.error ?? "Unable to verify account availability.");
      return;
    }
    if (availability.usernameTaken || availability.phoneTaken || availability.emailTaken) {
      const reasons = [
        availability.usernameTaken ? "username" : null,
        availability.phoneTaken ? "phone number" : null,
        availability.emailTaken ? "email" : null,
      ]
        .filter(Boolean)
        .join(", ");
      setError(`That ${reasons} is already registered.`);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name: trimmedName,
          username: trimmedUsername,
          contact_number: normalizedContact,
          contact_country_code: normalizedCallingCode,
          contact_country_iso2: selectedPhoneCountry.iso2,
        },
      },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Profiles row will be created via DB trigger (see schema.sql).
    if (data.user && !data.session && !data.user.email_confirmed_at) {
      setPassword("");
      setNotice(
        "Account created. Please verify your email before logging in. Check your inbox first, then your spam/junk folder if the email is not visible."
      );
      return;
    }

    if (data.user) router.replace(redirectTo);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Create account</div>
          <div className="text-sm text-white/60">Public browsing is free. Account is required to buy.</div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              hint="Shown on your profile and receipts."
            />
            <div className="block">
              <div className="mb-1 text-sm text-white/80">Contact Number</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                <label className="block">
                  <div className="mb-1 text-xs uppercase tracking-[0.18em] text-white/45">
                    Country
                  </div>
                  <CountryCodePicker
                    value={phoneCountryIso2}
                    onChange={(country) => setPhoneCountryIso2(country.iso2)}
                    error={phoneError}
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-xs uppercase tracking-[0.18em] text-white/45">
                    Number
                  </div>
                  <input
                    value={contactNumber}
                    onChange={(e) =>
                      setContactNumber(
                        normalizePhoneInputForCountry(
                          selectedPhoneCountry.iso2,
                          e.target.value
                        )
                      )
                    }
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData("text");
                      const detectedCountry =
                        findPhoneCountryFromInternationalPhone(
                          pasted,
                          phoneCountryIso2
                        );
                      const nextCountryIso2 =
                        detectedCountry?.iso2 ?? selectedPhoneCountry.iso2;
                      if (detectedCountry) {
                        setPhoneCountryIso2(detectedCountry.iso2);
                      }
                      e.preventDefault();
                      setContactNumber(
                        normalizePhoneInputForCountry(
                          nextCountryIso2,
                          pasted
                        )
                      );
                    }}
                    onBlur={() => {
                      setPhoneTouched(true);
                      setContactNumber((current) => {
                        const trimmed = current.trim();
                        const detectedCountry =
                          findPhoneCountryFromInternationalPhone(
                            trimmed,
                            phoneCountryIso2
                          );
                        if (detectedCountry) {
                          setPhoneCountryIso2(detectedCountry.iso2);
                        }
                        return normalizePhoneInputForCountry(
                          detectedCountry?.iso2 ?? selectedPhoneCountry.iso2,
                          trimmed
                        );
                      });
                    }}
                    required
                    type="tel"
                    autoComplete="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={getPhoneLocalMaxLength(selectedPhoneCountry.iso2)}
                    placeholder={phonePlaceholder}
                    className={`w-full rounded-xl border bg-bg-800 px-4 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 ${
                      phoneError
                        ? "border-red-500/60 focus:ring-red-500/40"
                        : "border-white/10 focus:ring-accent-500/60"
                    }`}
                  />
                </label>
              </div>
              {phoneError ? <div className="mt-1 text-sm text-red-400">{phoneError}</div> : null}
            </div>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required hint="Use at least 8 characters." />

            <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
              <label className="flex items-start gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-accent-500"
                />
                <span className="leading-5">
                  I agree to the{" "}
                  <Link
                    href="/terms"
                    className="text-accent-700 hover:underline dark:text-accent-200"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="text-accent-700 hover:underline dark:text-accent-200"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            </div>

            {error ? <div className="text-sm text-red-400">{error}</div> : null}
            {notice ? <div className="text-sm text-emerald-400">{notice}</div> : null}

            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </Button>

            <div className="text-sm text-white/60">
              Already have an account?{" "}
              <Link
                href={`/auth/login?redirect=${encodeURIComponent(redirectTo)}`}
                className="text-accent-700 hover:underline dark:text-accent-200"
              >
                Login
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <React.Suspense
      fallback={
        <main className="mx-auto max-w-md px-4 py-10 text-white/60">
          Loading...
        </main>
      }
    >
      <RegisterContent />
    </React.Suspense>
  );
}
