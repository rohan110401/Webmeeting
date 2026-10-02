import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/ProfileForm";
import { useAuth } from "@/auth/AuthProvider";

const Settings = () => {
  const auth = useAuth();
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 font-semibold">Profile</h2>
        <ProfileForm />
      </section>
      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-1 font-semibold">Account</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{auth.session?.user.email}</span>
        </p>
        <Button variant="outline" onClick={() => auth.signOut()}>
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </section>
    </div>
  );
};

export default Settings;
