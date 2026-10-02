import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, LogIn, Video } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/Loading";
import { safeNextPath, useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

const emailSchema = z.string().trim().toLowerCase().email("Please enter a valid email address.");

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
          <PasswordSignIn onSignedIn={() => navigate(next, { replace: true })} />
        </div>
      </div>
    </div>
  );
};

/**
 * Email and password. Accounts are created by the operator in the Supabase
 * dashboard, never here, and a wrong email and a wrong password get the same
 * message, so the form never reveals who has an account.
 */
const PasswordSignIn = ({ onSignedIn }: { onSignedIn: () => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: parsed.data, password });
    setBusy(false);
    if (signInError) {
      setError(
        signInError.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : signInError.status === 400 || signInError.status === 401
            ? "That email and password don't match."
            : "We couldn't sign you in just now. Check your connection and try again.",
      );
      return;
    }
    onSignedIn();
  };

  return (
    <form onSubmit={signIn} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="signin-email">Email address</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          autoFocus
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signin-password">Password</Label>
        <div className="relative">
          <Input
            id="signin-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        <LogIn aria-hidden="true" />
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Accounts are by invitation only. Forgot your password? Ask whoever runs this app to reset it.
      </p>
    </form>
  );
};

export default Login;
