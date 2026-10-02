import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/Loading";
import { NotFound } from "@/components/NotFound";
import { supabaseConfigured } from "@/lib/supabase";
import Login from "@/pages/Login";
import Home from "@/pages/Home";

const NewSession = lazy(() => import("@/pages/NewSession"));
const SessionPage = lazy(() => import("@/pages/SessionPage"));
const Settings = lazy(() => import("@/pages/Settings"));
// The call screen carries LiveKit and the encryption worker; nothing else loads them.
const CallPage = lazy(() => import("@/call/CallPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 },
  },
});

/** Providers that need the router (useNavigate, useBlocker) sit inside it. */
const Root = () => (
  <AuthProvider>
    <Suspense fallback={<Loading />}>
      <Outlet />
    </Suspense>
  </AuthProvider>
);

const Shell = () => (
  <RequireAuth>
    <AppShell>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </AppShell>
  </RequireAuth>
);

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/login", element: <Login /> },
      {
        path: "/s/:sessionId/call",
        element: (
          <RequireAuth>
            <CallPage />
          </RequireAuth>
        ),
      },
      {
        element: <Shell />,
        children: [
          { path: "/", element: <Home /> },
          { path: "/s/new", element: <NewSession /> },
          { path: "/s/:sessionId", element: <SessionPage /> },
          { path: "/settings", element: <Settings /> },
          { path: "*", element: <NotFound what="page" /> },
        ],
      },
    ],
  },
]);

const NotConfigured = () => (
  <div className="mx-auto max-w-lg px-4 py-20">
    <h1 className="text-xl font-semibold">Almost there</h1>
    <p className="mt-2 text-muted-foreground">
      This build has no Supabase settings. Copy <code>.env.example</code> to <code>.env.local</code>, fill in{" "}
      <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, and restart the dev server.
    </p>
  </div>
);

const App = () =>
  supabaseConfigured ? (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  ) : (
    <NotConfigured />
  );

export default App;
