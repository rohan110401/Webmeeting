/**
 * Typed access to the backend. Reads and writes go through database functions
 * that enforce access themselves (RLS + participant checks); anything needing
 * the LiveKit secret runs in an Edge Function. Errors always arrive as
 * ApiError with a stable code and a message written for people.
 */
import { supabase } from "./supabase";
import type { Note, Pair, Profile, SavedNote, SessionDetails, SessionListItem, VideoToken } from "./types";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const NETWORK_MESSAGE = "We couldn't reach the server. Check your connection and try again.";
const GENERIC_MESSAGE = "Something went wrong on our side. Please try again.";

interface DbError {
  code?: string;
  message?: string;
  hint?: string | null;
  details?: string | null;
}

/** Our SQL raises P0002 for "not found / not yours" and P0001 with a hint code. */
function dbError(error: DbError): ApiError {
  if (error.code === "P0002" || error.code === "42501") {
    return new ApiError("NOT_FOUND", "We couldn't find that session.");
  }
  if (error.code === "P0001") {
    return new ApiError(error.hint || "REJECTED", error.message || GENERIC_MESSAGE, { detail: error.details });
  }
  if (error.code === "PGRST301" || error.code === "PGRST303") {
    return new ApiError("UNAUTHENTICATED", "Your sign-in has expired. Please sign in again.");
  }
  // supabase-js reports fetch failures with an empty code.
  if (!error.code) return new ApiError("NETWORK_ERROR", NETWORK_MESSAGE);
  return new ApiError("DATABASE_ERROR", GENERIC_MESSAGE);
}

function unwrap<T>(result: { data: unknown; error: DbError | null }): T {
  if (result.error) throw dbError(result.error);
  return result.data as T;
}

async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke(name, { body });
  } catch {
    throw new ApiError("NETWORK_ERROR", NETWORK_MESSAGE);
  }
  if (result.error) {
    // Non-2xx responses carry { error: { code, message, ...details } }.
    let payload: { error?: { code?: string; message?: string } & Record<string, unknown> } | undefined;
    try {
      payload = await (result.error as { context?: Response }).context?.json();
    } catch {
      // not JSON
    }
    if (payload?.error?.message) {
      const { code, message, ...details } = payload.error;
      throw new ApiError(code ?? "ERROR", message, details);
    }
    throw new ApiError("NETWORK_ERROR", NETWORK_MESSAGE);
  }
  return (result.data as { data: T }).data;
}

export const api = {
  // --- profile ---------------------------------------------------------------
  myProfile: async (userId: string): Promise<Profile | null> =>
    unwrap(await supabase.from("profiles").select("id, display_name, timezone").eq("id", userId).maybeSingle()),

  updateProfile: async (userId: string, changes: { display_name?: string; timezone?: string }) => {
    unwrap(await supabase.from("profiles").update(changes).eq("id", userId));
  },

  // --- sessions --------------------------------------------------------------
  mySessions: async (scope: "upcoming" | "history"): Promise<SessionListItem[]> =>
    (unwrap<SessionListItem[] | null>(await supabase.rpc("my_sessions", { p_scope: scope })) ?? []),

  getSession: async (sessionId: string): Promise<SessionDetails | null> =>
    unwrap<SessionDetails | null>(await supabase.rpc("get_session", { p_session_id: sessionId })),

  myPairs: async (): Promise<Pair[]> => unwrap<Pair[] | null>(await supabase.rpc("my_pairs")) ?? [],

  createSession: async (input: {
    pairId: string;
    scheduledAt?: string;
    durationMinutes?: number;
    title?: string;
  }): Promise<string> =>
    unwrap(
      await supabase.rpc("create_session", {
        p_pair_id: input.pairId,
        p_scheduled_at: input.scheduledAt ?? null,
        p_duration_minutes: input.durationMinutes ?? 60,
        p_title: input.title ?? null,
      }),
    ),

  cancelSession: async (sessionId: string) => {
    unwrap(await supabase.rpc("cancel_session", { p_session_id: sessionId }));
  },

  /** Ends the session for both people and closes the video room. */
  endSession: (sessionId: string) => callFunction<{ ended: boolean }>("session-end", { sessionId }),

  videoToken: (sessionId: string) => callFunction<VideoToken>("video-token", { sessionId }),

  // --- notes -----------------------------------------------------------------
  /** Your own note for a session; RLS makes anyone else's invisible. */
  myNote: async (sessionId: string): Promise<Note> => {
    const row = unwrap<{ content: string; version: number; updated_at: string } | null>(
      await supabase.from("session_notes").select("content, version, updated_at").eq("session_id", sessionId).maybeSingle(),
    );
    return row ?? { content: "", version: 0, updated_at: null };
  },

  saveNote: async (sessionId: string, content: string, baseVersion: number): Promise<SavedNote> =>
    unwrap(
      await supabase.rpc("save_note", { p_session_id: sessionId, p_content: content, p_base_version: baseVersion }),
    ),
};
