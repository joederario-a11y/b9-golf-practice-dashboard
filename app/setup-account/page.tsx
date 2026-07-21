"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { MaiCoachLogoFull } from "@/components/brand/mai-coach-logo";

type SetupUser = {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  role: "admin" | "coach" | "member";
};

type SetupState =
  | { status: "checking"; message: string; user?: never }
  | { status: "ready"; message: string; user: SetupUser }
  | { status: "saving"; message: string; user: SetupUser }
  | { status: "complete"; message: string; user: SetupUser }
  | { status: "error"; message: string; user?: never };

function safeSetupMessage(status: number, message?: string) {
  if (status === 410) {
    return "This setup link has expired. Ask your coach or admin to resend it.";
  }
  if (status === 401 || status === 404 || status === 409) {
    return "This setup link is invalid or has already been used. Ask your coach or admin to resend it.";
  }
  if (message) return message;
  return "This setup link could not be checked right now. Please try again.";
}

function roleLabel(role: SetupUser["role"]) {
  if (role === "coach") return "Coach";
  if (role === "admin") return "Admin";
  return "Member";
}

function redirectPathForRole(role: SetupUser["role"]) {
  if (role === "coach") return "/coach";
  if (role === "admin") return "/admin";
  return "/?tab=videos";
}

export default function SetupAccountPage() {
  const [setupState, setSetupState] = useState<SetupState>({
    status: "checking",
    message: "Checking your secure setup link...",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function validateSetupToken() {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("token")?.trim();
      if (!token) {
        setSetupState({
          status: "error",
          message: "This setup link is missing its secure token. Ask your coach or admin to resend it.",
        });
        return;
      }

      try {
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = await response.json().catch(() => ({})) as {
          error?: string;
          purpose?: string;
          user?: SetupUser;
        };
        if (cancelled) return;
        window.history.replaceState(null, "", "/setup-account");
        if (!response.ok || payload.purpose !== "account_setup" || !payload.user) {
          setSetupState({
            status: "error",
            message: safeSetupMessage(response.status, payload.error),
          });
          return;
        }
        setSetupState({
          status: "ready",
          message: "Create your password to finish setting up your account.",
          user: payload.user,
        });
      } catch {
        if (!cancelled) {
          setSetupState({
            status: "error",
            message: "This setup link could not be checked right now. Please try again.",
          });
        }
      }
    }

    void validateSetupToken();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = useMemo(() => {
    if (setupState.status === "checking" || setupState.status === "error") return "";
    return setupState.user.displayName || [setupState.user.firstName, setupState.user.lastName].filter(Boolean).join(" ") || setupState.user.email;
  }, [setupState]);

  async function createPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (setupState.status !== "ready") return;
    if (password !== confirmPassword) {
      setSetupState({ ...setupState, message: "Passwords must match." });
      return;
    }
    setSetupState({ ...setupState, status: "saving", message: "Saving your password..." });
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; publicMessage?: string };
      if (!response.ok) {
        setSetupState({
          status: "ready",
          user: setupState.user,
          message: payload.publicMessage ?? payload.error ?? "Your password could not be saved.",
        });
        return;
      }
      setSetupState({
        status: "complete",
        user: setupState.user,
        message: "Your account is ready. Opening your MAI Coach workspace...",
      });
      window.setTimeout(() => {
        window.location.assign(redirectPathForRole(setupState.user.role));
      }, 750);
    } catch {
      setSetupState({
        status: "ready",
        user: setupState.user,
        message: "Your password could not be saved right now. Please try again.",
      });
    }
  }

  const canEditPassword = setupState.status === "ready" || setupState.status === "saving";
  const passwordInputType = showPassword ? "text" : "password";

  return (
    <main className="setup-account-page">
      <section className="setup-account-card" aria-live="polite">
        <MaiCoachLogoFull className="setup-account-logo" />
        <p className="eyebrow">Welcome to MAI Coach</p>
        <h1>Create your password to finish setting up your account.</h1>

        {(setupState.status === "ready" || setupState.status === "saving" || setupState.status === "complete") && (
          <div className="setup-account-summary">
            <span>{displayName}</span>
            <strong>{roleLabel(setupState.user.role)} account</strong>
            <small>{setupState.user.email}</small>
          </div>
        )}

        {setupState.status === "checking" && (
          <p className="setup-account-message">{setupState.message}</p>
        )}

        {setupState.status === "error" && (
          <div className="setup-account-error">
            <strong>Setup link needs attention</strong>
            <p>{setupState.message}</p>
            <a className="secondary-action" href="/">
              Return to MAI Coach
            </a>
          </div>
        )}

        {canEditPassword && (
          <form className="setup-account-form" onSubmit={createPassword}>
            <label>
              <span>New password</span>
              <div className="setup-password-field">
                <input
                  autoComplete="new-password"
                  autoFocus
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a password"
                  required
                  type={passwordInputType}
                  value={password}
                />
                <button onClick={() => setShowPassword((current) => !current)} type="button">
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <label>
              <span>Confirm password</span>
              <input
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
                required
                type={passwordInputType}
                value={confirmPassword}
              />
            </label>
            <p className="setup-account-message">{setupState.message}</p>
            <button className="primary-action" disabled={setupState.status === "saving"} type="submit">
              {setupState.status === "saving" ? "Creating Account..." : "Create Account"}
            </button>
          </form>
        )}

        {setupState.status === "complete" && (
          <p className="setup-account-message">{setupState.message}</p>
        )}
      </section>
    </main>
  );
}
