import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth/AuthProvider";
import { useProfile } from "@/auth/useProfile";
import { api, ApiError } from "@/lib/api";
import { allTimeZones, viewerTimeZone } from "@/lib/time";

export const ProfileForm = ({ submitLabel = "Save" }: { submitLabel?: string }) => {
  const { userId } = useAuth();
  const profile = useProfile();
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile.data?.display_name ?? "");
  const [timezone, setTimezone] = useState(
    profile.data?.display_name ? profile.data.timezone : viewerTimeZone() || "Asia/Kolkata",
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.updateProfile(userId as string, { display_name: name.trim(), timezone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Saved");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "We couldn't save that. Please try again."),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    if (name.trim().length > 80) {
      setError("Please use 80 characters or fewer.");
      return;
    }
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="display-name">Your name</Label>
        <Input
          id="display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          maxLength={80}
          disabled={save.isPending}
          autoFocus={!profile.data?.display_name}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Time zone</Label>
        <select
          id="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          disabled={save.isPending}
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {allTimeZones().map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
};
