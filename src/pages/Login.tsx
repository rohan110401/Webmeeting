import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Mail, Video } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/Loading";
import { safeNextPath, useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

const emailSchema = z.string().trim().toLowerCase().email("Please enter a valid email address.");

/**
 * Password sign-in for test accounts: always in local dev builds, and in a
 * deployed build only when it was built with VITE_ALLOW_PASSWORD_SIGNIN=true
 * (the test site). Production builds leave it out.
 */
const passwordSignInEnabled = import.meta.env.DEV || import.meta.env.VITE_ALLOW_PASSWORD_SIGNIN === "true";

const Login = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));

  if (auth.loading) return <Loading />;
  if (auth.session) return <Navigate to={next} replace />;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Video className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Private video sessions with your own notes.</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <EmailCodeSignIn onSignedIn={() => navigate(next, { replace: true })} />
        </div>
      </div>
    </div>
  );
};

/**
 * Passwordless sign-in: we email a 6-digit code and the person types it in.
 * Accounts are created by the operator, never here, and the form behaves the
 * same whether or not an email has an account.
 */
const EmailCodeSignIn = ({ onSignedIn }: { onSignedIn: () => void }) => {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.href },
    });
    setBusy(false);
    if (otpError?.status === 429) {
      setError("Too many attempts. Please wait a minute and try again.");
      return;
    }
    if (otpError && otpError.status !== 422 && otpError.status !== 400) {
      setError("We couldn't send a code just now. Please try again.");
      return;
    }
    // An unknown email (422 / signups disabled) moves on exactly like a known
    // one, so the form never reveals who has an account.
    setEmail(parsed.data);
    setStep("code");
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const token = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) {
      setError("Please enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    if (verifyError) {
      setError("That code didn't work. Check the latest email, or send a new code.");
      return;
    }
    onSignedIn();
  };

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} className="space-y-4" noValidate>
        <p className="text-sm text-muted-foreground">
          If <span className="font-medium text-foreground">{email}</span> has an account, we've emailed it a 6-digit
          code. It expires in a few minutes.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="signin-code">Sign-in code</Label>
          <Input
            id="signin-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="text-center text-lg tracking-[0.4em]"
            disabled={busy}
            autoFocus
            required
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Checking…" : "Sign in"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setStep("email");
            setCode("");
            setError(null);
          }}
        >
          <ArrowLeft aria-hidden="true" />
          Use a different email
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={sendCode} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="signin-email">Email address</Label>
          <Input
            id="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          <Mail aria-hidden="true" />
          {busy ? "Sending…" : "Email me a sign-in code"}
        </Button>
        <p className="text-xs text-muted-foreground">No password needed. Accounts are by invitation only.</p>
      </form>
      {passwordSignInEnabled && <PasswordSignIn onSignedIn={onSignedIn} />}
    </div>
  );
};

/**
 * Test accounts only: sign in with a password set in the Supabase dashboard,
 * without depending on email delivery. See passwordSignInEnabled.
 */
const PasswordSignIn = ({ onSignedIn }: { onSignedIn: () => void }) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setOpen(true)}>
        Test account? Sign in with a password
      </button>
    );
  }

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) {
      setError("That email and password don't match.");
      return;
    }
    onSignedIn();
  };

  return (
    <form onSubmit={signIn} className="space-y-3 rounded-lg border border-dashed p-3" noValidate>
      <p className="text-xs font-medium">Test accounts only</p>
      <Input
        type="email"
        autoComplete="username"
        placeholder="Email"
        aria-label="Test account email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />
      <Input
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        aria-label="Test account password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={busy}>
        {busy ? "Signing in…" : "Sign in with password"}
      </Button>
    </form>
  );
};

export default Login;
