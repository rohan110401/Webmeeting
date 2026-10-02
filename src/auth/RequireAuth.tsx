import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loading } from "@/components/Loading";
import { ProfileSetup } from "@/pages/ProfileSetup";
import { useAuth } from "./AuthProvider";
import { useProfile } from "./useProfile";

/**
 * Sends signed-out visitors to /login and brings them back afterwards. A
 * first-time user picks the name the other person will see before anything
 * else.
 */
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const auth = useAuth();
  const location = useLocation();
  const profile = useProfile();

  if (auth.loading) return <Loading />;
  if (!auth.session) {
    const here = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />;
  }
  if (profile.isLoading) return <Loading />;
  if (profile.data && !profile.data.display_name.trim()) return <ProfileSetup />;

  return <>{children}</>;
};
