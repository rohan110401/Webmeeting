import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "./AuthProvider";

export function useProfile() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: () => api.myProfile(userId as string),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });
}
