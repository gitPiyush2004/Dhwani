import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, LockKeyhole } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/StateViews";
import { getAuthStatus, signIn } from "@/lib/api";
import { AUTH_EXPIRED_EVENT } from "@/lib/http";

/**
 * Guards the dashboard. When the backend has ADMIN_PASSWORD set, staff sign in
 * once per device; on mock data (no backend) this renders straight through.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["auth-status"], queryFn: getAuthStatus, staleTime: Infinity, retry: 1 });

  useEffect(() => {
    const expired = () => {
      qc.setQueryData(["auth-status"], { required: true, authenticated: false });
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
  }, [qc]);

  if (status.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Loader2 className="h-5 w-5 animate-spin text-ink3" aria-label="Loading" />
      </div>
    );
  }
  if (status.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
        <div className="w-full max-w-md">
          <ErrorState title="Couldn't reach the clinic server" onRetry={() => status.refetch()} />
        </div>
      </div>
    );
  }
  if (status.data?.required && !status.data.authenticated) {
    return (
      <SignIn
        onSignedIn={() => {
          qc.setQueryData(["auth-status"], { required: true, authenticated: true });
          void qc.invalidateQueries();
        }}
      />
    );
  }
  return <>{children}</>;
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await signIn(password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 inline-flex">
          <Logo />
        </Link>
        <form onSubmit={submit} className="rounded-lg border border-line bg-surface p-6">
          <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface2">
            <LockKeyhole className="h-4 w-4 text-ink2" />
          </span>
          <h1 className="text-lg font-semibold text-ink">Sign in to the clinic dashboard</h1>
          <p className="mt-1 text-[13px] text-ink3">Calls, appointments and patient details are behind this login.</p>
          <div className="mt-5">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "pw-error" : undefined}
            />
            {error && (
              <p id="pw-error" role="alert" className="mt-2 text-[13px] text-signal">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" variant="ink" className="mt-5 w-full" disabled={!password || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
