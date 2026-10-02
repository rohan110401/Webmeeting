import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the dev server and a real Supabase project with
 * LiveKit configured. They need two test accounts that are paired and have
 * passwords (see docs/RUNBOOK.md, "End-to-end tests"); without the E2E_*
 * variables every test is skipped.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5180",
    trace: "retain-on-failure",
    permissions: ["camera", "microphone"],
    launchOptions: {
      // Synthetic camera and microphone, no permission prompts.
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5180",
    reuseExistingServer: true,
  },
});
