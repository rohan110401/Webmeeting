// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveEngine, type AutosaveOptions, type AutosaveState, type SaveResult } from "./autosave";

/** A fake server holding one note, with optional failures. */
function fakeServer(initial = { content: "", version: 0 }) {
  const server = { ...initial, calls: [] as { content: string; base: number }[], fail: null as null | { code?: string } };
  const save = vi.fn(async (content: string, base: number): Promise<SaveResult> => {
    server.calls.push({ content, base });
    await Promise.resolve();
    if (server.fail) throw server.fail;
    if (base !== server.version) throw { code: "VERSION_CONFLICT" };
    server.content = content;
    server.version += 1;
    return { version: server.version, updated_at: new Date().toISOString() };
  });
  const load = vi.fn(async () => ({ content: server.content, version: server.version }));
  return { server, save, load };
}

function setup(overrides: Partial<AutosaveOptions> = {}, initial = { content: "", version: 0 }) {
  const fake = fakeServer(initial);
  const states: AutosaveState[] = [];
  let online = true;
  const engine = new AutosaveEngine(
    {
      initialContent: initial.content,
      initialVersion: initial.version,
      save: fake.save,
      load: fake.load,
      isOnline: () => online,
      ...overrides,
    },
    (s) => states.push(s),
  );
  return {
    ...fake,
    engine,
    states,
    last: () => engine.getState(),
    setOnline: (v: boolean) => {
      online = v;
    },
  };
}

/** Lets pending promise callbacks run without moving the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("AutosaveEngine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not save on every keystroke; saves once 1.5 s after typing stops", async () => {
    const t = setup();
    for (const text of ["H", "He", "Hel", "Hell", "Hello"]) {
      t.engine.update(text);
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(t.save).not.toHaveBeenCalled();
    expect(t.last().status).toBe("dirty");

    await vi.advanceTimersByTimeAsync(1_500);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.server.content).toBe("Hello");
    expect(t.last().status).toBe("saved");
    expect(t.last().unsaved).toBe(false);
  });

  it("saves at least every 10 s during continuous typing", async () => {
    const t = setup();
    let text = "";
    for (let i = 0; i < 24; i++) {
      text += "a";
      t.engine.update(text);
      await vi.advanceTimersByTimeAsync(500); // never pauses for 1.5 s
    }
    expect(t.save).toHaveBeenCalledTimes(1); // the 10 s max-wait fired once in 12 s
  });

  it("flush() saves immediately (blur / leaving the call)", async () => {
    const t = setup();
    t.engine.update("note");
    const ok = await t.engine.flush();
    expect(ok).toBe(true);
    expect(t.server.content).toBe("note");
  });

  it("saves edits made during a save straight after it", async () => {
    const t = setup();
    t.engine.update("first");
    const pending = t.engine.flush();
    t.engine.update("first and more");
    await pending;
    await settle();
    expect(t.server.content).toBe("first and more");
    expect(t.server.calls.map((c) => c.base)).toEqual([0, 1]);
    expect(t.last().status).toBe("saved");
  });

  it("keeps the text and retries with backoff while offline, then saves when back online", async () => {
    const t = setup();
    t.server.fail = { code: "NETWORK_ERROR" };
    t.setOnline(false);
    t.engine.update("written offline");
    await vi.advanceTimersByTimeAsync(1_500);
    expect(t.last().status).toBe("offline");
    expect(t.last().content).toBe("written offline");
    expect(t.last().unsaved).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000); // retry 1
    await vi.advanceTimersByTimeAsync(2_000); // retry 2
    expect(t.save).toHaveBeenCalledTimes(3);

    t.server.fail = null;
    t.setOnline(true);
    t.engine.online();
    await settle();
    expect(t.server.content).toBe("written offline");
    expect(t.last().status).toBe("saved");
  });

  it("caps the retry delay at 30 s", async () => {
    const t = setup();
    t.server.fail = { code: "NETWORK_ERROR" };
    t.engine.update("x");
    await t.engine.flush();
    // 1 + 2 + 4 + 8 + 16 + 30 + 30 = 91 s → 7 retries after the first attempt.
    await vi.advanceTimersByTimeAsync(91_000);
    expect(t.save).toHaveBeenCalledTimes(8);
  });

  it("reports a conflict when another tab saved different text, and never overwrites it silently", async () => {
    const t = setup({}, { content: "v1", version: 1 });
    t.server.content = "from the other tab";
    t.server.version = 2;
    t.engine.update("from this tab");
    await t.engine.flush();
    expect(t.last().status).toBe("conflict");
    expect(t.server.content).toBe("from the other tab");

    // Further typing doesn't trigger saves while the conflict is open.
    t.engine.update("from this tab, still typing");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(t.server.content).toBe("from the other tab");
  });

  it("resolves a conflict either way", async () => {
    const mine = setup({}, { content: "v1", version: 1 });
    mine.server.content = "theirs";
    mine.server.version = 2;
    mine.engine.update("mine");
    await mine.engine.flush();
    await mine.engine.resolveConflict("mine");
    expect(mine.server.content).toBe("mine");
    expect(mine.last().status).toBe("saved");

    const theirs = setup({}, { content: "v1", version: 1 });
    theirs.server.content = "theirs";
    theirs.server.version = 2;
    theirs.engine.update("mine");
    await theirs.engine.flush();
    await theirs.engine.resolveConflict("theirs");
    expect(theirs.last().content).toBe("theirs");
    expect(theirs.last().status).toBe("saved");
  });

  it("adopts the server version silently when it already holds this exact text", async () => {
    const t = setup({}, { content: "v1", version: 1 });
    // e.g. the last-chance save sent while the page was hiding succeeded.
    t.server.content = "same text";
    t.server.version = 2;
    t.engine.update("same text");
    expect(await t.engine.flush()).toBe(true);
    expect(t.last().status).toBe("saved");
    t.engine.update("same text, continued");
    await t.engine.flush();
    expect(t.server.content).toBe("same text, continued");
  });

  it("does not retry errors that retrying can't fix", async () => {
    const t = setup();
    t.server.fail = { code: "NOT_FOUND" };
    t.engine.update("x");
    await t.engine.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.last().status).toBe("error");
  });

  it("returns to saved without a request when the text is changed back", async () => {
    const t = setup({}, { content: "kept", version: 3 });
    t.engine.update("kept!");
    t.engine.update("kept");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(t.save).not.toHaveBeenCalled();
    expect(t.last().status).toBe("saved");
  });

  it("offers a last-chance save only while something is unsaved", async () => {
    const t = setup({}, { content: "a", version: 1 });
    expect(t.engine.pendingSave()).toBeNull();
    t.engine.update("ab");
    expect(t.engine.pendingSave()).toEqual({ content: "ab", baseVersion: 1 });
    await t.engine.flush();
    expect(t.engine.pendingSave()).toBeNull();
  });
});
