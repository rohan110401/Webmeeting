import { expect, test, type Browser, type Page } from "@playwright/test";

const A = { email: process.env.E2E_USER_A_EMAIL, password: process.env.E2E_USER_A_PASSWORD };
const B = { email: process.env.E2E_USER_B_EMAIL, password: process.env.E2E_USER_B_PASSWORD };
const configured = Boolean(A.email && A.password && B.email && B.password);

async function signIn(browser: Browser, user: { email?: string; password?: string }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  // Password sign-in exists only in dev builds, for test accounts.
  await page.getByRole("button", { name: /sign in with a password/i }).click();
  await page.getByLabel("Test account email").fill(user.email as string);
  await page.getByLabel("Test account password").fill(user.password as string);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page.getByRole("heading", { name: /hi,|your sessions/i })).toBeVisible();
  return page;
}

test.describe("two-person session", () => {
  test.skip(!configured, "Set E2E_USER_A_EMAIL/PASSWORD and E2E_USER_B_EMAIL/PASSWORD to run.");

  test("call, private notes, end for both, history", async ({ browser }) => {
    const alice = await signIn(browser, A);
    const bob = await signIn(browser, B);

    // A starts a session now and joins.
    await alice.getByRole("button", { name: "Start now" }).click();
    await alice.waitForURL(/\/s\/[0-9a-f-]{36}\/call$/);
    const callUrl = alice.url();
    const sessionPath = new URL(callUrl).pathname.replace(/\/call$/, "");
    await alice.getByRole("button", { name: "Join now" }).click();
    await expect(alice.getByText(/waiting for .* to join/i)).toBeVisible();

    // B joins the same session from their home page.
    await bob.reload();
    await bob.getByRole("link", { name: "Join" }).first().click();
    await bob.getByRole("button", { name: "Join now" }).click();

    // Both see the other person's video, end-to-end encrypted.
    await expect(alice.locator("video")).toHaveCount(2, { timeout: 30_000 });
    await expect(bob.locator("video")).toHaveCount(2, { timeout: 30_000 });
    await expect(alice.getByText("End-to-end encrypted")).toBeVisible({ timeout: 20_000 });

    // Each writes a private note.
    const aliceSecret = `alice-only-${Date.now()}`;
    const bobSecret = `bob-only-${Date.now()}`;
    await alice.getByLabel("My private notes").fill(aliceSecret);
    await bob.getByLabel("My private notes").fill(bobSecret);
    await expect(alice.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(bob.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Neither page ever shows the other's note.
    await expect(alice.getByLabel("My private notes")).toHaveValue(aliceSecret);
    await expect(bob.getByLabel("My private notes")).toHaveValue(bobSecret);
    expect(await alice.content()).not.toContain(bobSecret);
    expect(await bob.content()).not.toContain(aliceSecret);

    // A ends the session; both are disconnected.
    await alice.getByRole("button", { name: /^End/ }).click();
    await alice.getByRole("button", { name: "End session" }).click();
    await expect(alice.getByRole("heading", { name: "The session has ended" })).toBeVisible();
    await expect(bob.getByRole("heading", { name: "The session has ended" })).toBeVisible({ timeout: 20_000 });

    // History keeps each person's own note only.
    await bob.goto(sessionPath);
    await expect(bob.getByLabel("My private notes")).toHaveValue(bobSecret);
    expect(await bob.content()).not.toContain(aliceSecret);
  });

  test("a session id that isn't yours looks like it doesn't exist", async ({ browser }) => {
    const alice = await signIn(browser, A);
    await alice.goto("/s/00000000-0000-4000-8000-000000000000");
    await expect(alice.getByRole("heading", { name: /couldn't find that session/i })).toBeVisible();
    await alice.goto("/s/00000000-0000-4000-8000-000000000000/call");
    await expect(alice.getByRole("heading", { name: /couldn't find that session/i })).toBeVisible();
  });
});
