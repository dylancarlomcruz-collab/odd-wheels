"use client";

import * as React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useRouter, useSearchParams } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { PHONE_MAX_LENGTH, sanitizePhone, validatePhone11 } from "@/lib/phone";

function RegisterContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const redirectParam = sp.get("redirect");
  const redirectTo =
    redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";
  const emailRedirectTo = "https://www.odd-wheels.com/";
  const [fullName, setFullName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [contactNumber, setContactNumber] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
    const sanitizedContact = sanitizePhone(contactNumber);

    if (!trimmedUsername || !sanitizedContact || !trimmedEmail) {
      setError("Username, phone number, and email are required.");
      return;
    }
    if (!validatePhone11(sanitizedContact)) {
      setError("Use an 11-digit PH mobile number (09XXXXXXXXX).");
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
        contact_number: sanitizedContact,
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
          contact_number: sanitizedContact,
          address: address.trim(),
        },
      },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Profiles row will be created via DB trigger (see schema.sql).
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
            <Input
              label="Contact Number"
              value={contactNumber}
              onChange={(e) => setContactNumber(sanitizePhone(e.target.value))}
              required
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PHONE_MAX_LENGTH}
              hint="For delivery updates. 11-digit PH mobile number."
            />
            <Input label="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} />
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
