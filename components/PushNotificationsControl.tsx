"use client";

import * as React from "react";
import {
  Bell,
  BellOff,
  Send,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/components/ui/toast";
import {
  WEB_PUSH_PUBLIC_KEY,
  isIosDevice,
  isStandaloneDisplayMode,
  urlBase64ToUint8Array,
} from "@/lib/push/client";

type NotificationState =
  | "checking"
  | "unsupported"
  | "needs_install"
  | "available"
  | "enabled";

function normalizePushErrorMessage(message: string | null | undefined) {
  const raw = String(message ?? "").trim();
  if (!raw) {
    return {
      setupRequired: false,
      message: "Unable to enable notifications.",
    };
  }

  const lowered = raw.toLowerCase();
  if (lowered.includes("push_subscriptions") || lowered.includes("database setup")) {
    return {
      setupRequired: true,
      message:
        "Notifications need one Supabase setup step first. Apply the push_subscriptions SQL table, then try again.",
    };
  }

  return {
    setupRequired: false,
    message: raw,
  };
}

function getPlatformLabel() {
  if (typeof navigator === "undefined") return "unknown";
  const userAgent = String(navigator.userAgent ?? "").toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return "ios";
  if (/android/.test(userAgent)) return "android";
  return "desktop";
}

export function PushNotificationsControl() {
  const { user, session } = useAuth();
  const { profile } = useProfile();
  const [state, setState] = React.useState<NotificationState>("checking");
  const [permission, setPermission] =
    React.useState<NotificationPermission>("default");
  const [subscription, setSubscription] =
    React.useState<PushSubscription | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sendingTest, setSendingTest] = React.useState(false);
  const [setupIssue, setSetupIssue] = React.useState<string | null>(null);

  const authHeaders = React.useMemo(() => {
    const token = session?.access_token;
    if (!token) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, [session?.access_token]);

  const isAdmin = profile?.role === "admin";
  const notificationLabel = isAdmin ? "Admin alerts" : "Notifications";
  const notificationDescription = isAdmin
    ? "Cart, order, and purchase alerts for this admin account."
    : "Order updates for this device after you sign in.";
  const signInMessage = isAdmin
    ? "Sign in first so admin alerts can be tied to your account."
    : "Sign in first so order updates can be tied to your account.";
  const enabledMessage = isAdmin
    ? "Admin alerts are enabled on this device."
    : "Order notifications are enabled on this device.";

  const refreshState = React.useCallback(async () => {
    if (typeof window === "undefined") return;

    const onIos = isIosDevice();
    const installed = isStandaloneDisplayMode();
    const supportsPush =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (onIos && !installed) {
      setPermission("default");
      setSubscription(null);
      setState("needs_install");
      return;
    }

    if (!supportsPush) {
      setPermission("default");
      setSubscription(null);
      setState("unsupported");
      return;
    }

    setPermission(Notification.permission);

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const nextSubscription = await registration.pushManager.getSubscription();
      if (nextSubscription && authHeaders && user) {
        const response = await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(nextSubscription.endpoint)}`,
          {
            headers: authHeaders,
          }
        );
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok) {
          const normalized = normalizePushErrorMessage(result?.error);
          if (normalized.setupRequired) {
            await nextSubscription.unsubscribe().catch(() => undefined);
            setSetupIssue(normalized.message);
            setSubscription(null);
            setState("available");
            return;
          }
          setSetupIssue(null);
          setSubscription(null);
          setState("available");
          return;
        }
        if (result?.ok && result.subscribed !== true) {
          setSetupIssue(null);
          setSubscription(null);
          setState("available");
          return;
        }
      }

      setSetupIssue(null);
      setSubscription(nextSubscription);
      setState(nextSubscription ? "enabled" : "available");
    } catch {
      setSubscription(null);
      setState("unsupported");
    }
  }, [authHeaders, user]);

  React.useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const enableNotifications = React.useCallback(async () => {
    if (!user || !authHeaders) {
      toast({ intent: "error", message: "Sign in first to receive order notifications." });
      return;
    }
    if (!WEB_PUSH_PUBLIC_KEY.trim()) {
      toast({
        intent: "error",
        message: "Push notifications are not configured on this server yet.",
      });
      return;
    }
    if (state === "needs_install") {
      toast({
        intent: "error",
        message: "Install Odd Wheels to your Home Screen first on iPhone.",
      });
      return;
    }
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      toast({
        intent: "error",
        message: "This browser does not support push notifications.",
      });
      return;
    }

    if (Notification.permission === "denied") {
      toast({
        intent: "error",
        message:
          "Notifications are blocked for this browser. Re-enable them in browser settings.",
      });
      return;
    }

    setBusy(true);
    try {
      setSetupIssue(null);
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== "granted") {
        toast({
          intent: "error",
          message: "Notification permission was not granted.",
        });
        setState("available");
        return;
      }

      let nextSubscription = await registration.pushManager.getSubscription();
      if (!nextSubscription) {
        nextSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
        });
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          subscription: nextSubscription.toJSON(),
          platform: getPlatformLabel(),
          userAgent: navigator.userAgent,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const normalized = normalizePushErrorMessage(
          result?.error ?? "Unable to save notification device."
        );
        await nextSubscription.unsubscribe().catch(() => undefined);
        setSubscription(null);
        setState("available");
        if (normalized.setupRequired) {
          setSetupIssue(normalized.message);
        }
        toast({
          intent: "error",
          title: "Notifications unavailable",
          message: normalized.message,
          duration: 5000,
        });
        return;
      }

      setSetupIssue(null);
      setSubscription(nextSubscription);
      setState("enabled");
      toast({
        intent: "success",
        message: enabledMessage,
      });
    } catch (error: any) {
      const normalized = normalizePushErrorMessage(error?.message);
      if (normalized.setupRequired) {
        setSetupIssue(normalized.message);
      }
      toast({
        intent: "error",
        title: "Notifications unavailable",
        message: normalized.message,
        duration: 5000,
      });
      await refreshState();
    } finally {
      setBusy(false);
    }
  }, [authHeaders, enabledMessage, refreshState, state, user]);

  const disableNotifications = React.useCallback(async () => {
    if (!authHeaders) {
      toast({ intent: "error", message: "Sign in first to manage notifications." });
      return;
    }
    if (!subscription) {
      await refreshState();
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const normalized = normalizePushErrorMessage(
          result?.error ?? "Unable to turn off notifications."
        );
        toast({
          intent: "error",
          title: "Notifications unavailable",
          message: normalized.message,
          duration: 5000,
        });
      }
      await subscription.unsubscribe().catch(() => undefined);
      setSetupIssue(null);
      setSubscription(null);
      setState("available");
      toast({
        intent: "success",
        message: "Notifications are off for this device.",
      });
    } catch (error: any) {
      toast({
        intent: "error",
        message: error?.message ?? "Unable to turn off notifications.",
      });
    } finally {
      setBusy(false);
    }
  }, [authHeaders, refreshState, subscription]);

  const sendTestNotification = React.useCallback(async () => {
    if (!user || !authHeaders) {
      toast({ intent: "error", message: "Sign in first to test notifications." });
      return;
    }

    setSendingTest(true);
    try {
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: authHeaders,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const normalized = normalizePushErrorMessage(
          result?.error ?? "Unable to send a test notification."
        );
        if (normalized.setupRequired) {
          setSetupIssue(normalized.message);
        }
        throw new Error(normalized.message);
      }
      toast({
        intent: "success",
        message: "Test notification sent.",
      });
    } catch (error: any) {
      toast({
        intent: "error",
        title: "Test notification failed",
        message: error?.message ?? "Unable to send a test notification.",
        duration: 5000,
      });
    } finally {
      setSendingTest(false);
    }
  }, [authHeaders, user]);

  const disabledByServer = !WEB_PUSH_PUBLIC_KEY.trim();

  return (
    <div className="rounded-xl border border-white/10 bg-bg-950/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Bell className="h-4 w-4" />
            {notificationLabel}
          </div>
          <div className="mt-1 text-xs text-white/60">
            {notificationDescription}
          </div>
        </div>
        <span
          className={[
            "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
            state === "enabled"
              ? "border-emerald-500/30 text-emerald-200"
              : "border-white/10 text-white/50",
          ].join(" ")}
        >
          {state === "enabled" ? "On" : "Off"}
        </span>
      </div>

      <div className="mt-3 space-y-2 text-xs text-white/65">
        {!user ? (
          <div>{signInMessage}</div>
        ) : null}
        {disabledByServer ? (
          <div>Push keys are not configured on this server yet.</div>
        ) : null}
        {!disabledByServer && setupIssue ? (
          <div className="text-amber-200">{setupIssue}</div>
        ) : null}
        {!disabledByServer && state === "needs_install" ? (
          <div className="inline-flex items-center gap-2">
            <Smartphone className="h-3.5 w-3.5" />
            Install Odd Wheels to your Home Screen first, then reopen it and enable notifications.
          </div>
        ) : null}
        {!disabledByServer && state === "unsupported" ? (
          <div>This browser does not support web push notifications.</div>
        ) : null}
        {!disabledByServer &&
        permission === "denied" &&
        state !== "needs_install" ? (
          <div>Notifications are blocked. Re-enable them in browser settings.</div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            state === "enabled"
              ? void disableNotifications()
              : void enableNotifications()
          }
          disabled={
            busy ||
            disabledByServer ||
            Boolean(setupIssue) ||
            state === "checking" ||
            state === "unsupported"
          }
          className="gap-1.5"
        >
          {state === "enabled" ? (
            <>
              <BellOff className="h-3.5 w-3.5" />
              Turn off
            </>
          ) : (
            <>
              <Bell className="h-3.5 w-3.5" />
              {busy ? "Saving..." : "Enable"}
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void sendTestNotification()}
          disabled={
            sendingTest ||
            state !== "enabled" ||
            !user ||
            !authHeaders ||
            disabledByServer
          }
          className="gap-1.5"
        >
          <Send className="h-3.5 w-3.5" />
          {sendingTest ? "Sending..." : "Send test"}
        </Button>
      </div>
    </div>
  );
}
