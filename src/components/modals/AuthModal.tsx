"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2, Lock, Mail, User, Zap } from "lucide-react";
import { Alert, Button, Input, Modal } from "@/components/ui";
import { useAuthStore } from "@/store/useAuthStore";

export function AuthModal() {
  const authModalOpen = useAuthStore((s) => s.authModalOpen);
  const setAuthModalOpen = useAuthStore((s) => s.setAuthModalOpen);
  const oauth = useAuthStore((s) => s.oauth);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authModalOpen) return null;

  const handleOAuthClick = (provider: "google" | "github") => {
    const configured = provider === "google" ? oauth.google : oauth.github;
    if (!configured) {
      setOauthNotice(
        "OAuth credentials can be set in .env.local; please use Email/Password for instant login"
      );
      return;
    }
    setOauthNotice(
      "OAuth callback handler requires public redirect URI; use Email/Password for local login"
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOauthNotice(null);
    setSubmitting(true);
    try {
      const res =
        mode === "login"
          ? await login(email, password)
          : await register(email, password, name);
      if (!res.ok) {
        setError(res.error || "Authentication failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={authModalOpen}
      onClose={() => setAuthModalOpen(false)}
      maxWidthClassName="max-w-[400px]"
      className="relative p-6"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setAuthModalOpen(false)}
        aria-label="Close"
        className="absolute top-4 right-4 rounded-full"
      >
        <span className="sr-only">Close</span>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </Button>

      {/* Header: PanelFlow Logo + Subtitle */}
      <div className="mb-5 flex flex-col items-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#171a21] shadow-xs">
          <Zap className="h-5 w-5 text-slate-600 dark:text-zinc-400 text-slate-600 dark:text-zinc-400" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          {mode === "login" ? "Sign in to PanelFlow" : "Create your account"}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Log in to save your projects and sync your library
        </p>
      </div>

      {/* OAuth Buttons (RelayFlow style) */}
      <div className="grid grid-cols-2 gap-2.5">
        <Button
          variant="outline"
          size="md"
          onClick={() => handleOAuthClick("google")}
          className="rounded-lg bg-slate-50 dark:bg-[#171a21] px-3"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          Login with Google
        </Button>
        <Button
          variant="outline"
          size="md"
          onClick={() => handleOAuthClick("github")}
          className="rounded-lg bg-slate-50 dark:bg-[#171a21] px-3"
        >
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.11.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.69-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 2.89-.39c.98 0 1.97.13 2.89.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.41-2.7 5.39-5.27 5.67.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.21.67.79.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
          Login with GitHub
        </Button>
      </div>

      {oauthNotice && (
        <Alert
          variant="warning"
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          className="mt-3 px-3 py-2 text-[11px] rounded-lg"
        >
          {oauthNotice}
        </Alert>
      )}

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
        <span className="font-sans text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
          or continue with email
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
      </div>

      {/* Email + Password Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "register" && (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
              Full Name
            </label>
            <Input
              type="text"
              leftIcon={<User className="h-3.5 w-3.5" />}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineer Name"
              className="rounded-lg"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
            Email Address
          </label>
          <Input
            type="email"
            required
            leftIcon={<Mail className="h-3.5 w-3.5" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="rounded-lg"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
            Password
          </label>
          <Input
            type="password"
            required
            minLength={6}
            leftIcon={<Lock className="h-3.5 w-3.5" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
            className="rounded-lg"
          />
        </div>

        {error && (
          <Alert
            variant="error"
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            className="px-3 py-2 text-[11px] rounded-lg"
          >
            {error}
          </Alert>
        )}

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={submitting}
          className="w-full rounded-lg font-semibold"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {mode === "login" ? "Sign In" : "Create Account"}
        </Button>
      </form>

      <div className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setOauthNotice(null);
              }}
              className="font-semibold text-slate-900 dark:text-white hover:underline cursor-pointer"
            >
              Create Account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setOauthNotice(null);
              }}
              className="font-semibold text-slate-900 dark:text-white hover:underline cursor-pointer"
            >
              Sign In
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
