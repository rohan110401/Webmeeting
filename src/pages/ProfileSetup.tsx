import { ProfileForm } from "@/components/ProfileForm";

/** First sign-in: choose the name the other person sees. */
export const ProfileSetup = () => (
  <div className="flex min-h-full items-center justify-center px-4 py-12">
    <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Welcome</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        What should we call you? This is the name the other person sees in your sessions.
      </p>
      <ProfileForm submitLabel="Continue" />
    </div>
  </div>
);
