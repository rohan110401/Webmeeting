/**
 * Shared HTTP plumbing for every Edge Function: CORS limited to the app's own
 * origins, JSON responses, and one error shape.
 *
 * Every endpoint returns `{ data }` on success and
 * `{ error: { code, message, ...details } }` on failure.
 */
import { ZodError } from "npm:zod@3.25.76";

/** Error with an HTTP status and a stable machine-readable code. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Local development and the test site are allowed by default: every endpoint
// still requires the caller's own access token. Production sets
// ALLOWED_ORIGINS to its own site.
const DEFAULT_ORIGINS = [
  "http://localhost:5180",
  "http://127.0.0.1:5180",
  "https://webmeeting-test.netlify.app",
];

function allowedOriginPatterns(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Exact origins, or patterns with one `*` standing for a single DNS label —
 * enough for Netlify deploy previews (`https://*--site.netlify.app`) and no
 * more: the wildcard can never match a dot or a slash.
 */
export function isAllowedOrigin(origin: string, patterns = allowedOriginPatterns()): boolean {
  return patterns.some((pattern) => {
    const star = pattern.indexOf("*");
    if (star === -1) return pattern === origin;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false;
    const label = origin.slice(prefix.length, origin.length - suffix.length);
    return /^[a-z0-9-]+$/i.test(label);
  });
}

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const origin = req.headers.get("Origin");
  if (origin && isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Wraps an endpoint with CORS, method checking, body parsing and uniform error
 * handling. Errors are logged by code only — request bodies never reach the
 * logs.
 */
export function createHandler<T>(
  handler: (body: unknown, req: Request) => Promise<T>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    if (req.method !== "POST") {
      return json(req, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405);
    }

    let body: unknown = {};
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return json(req, { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400);
    }

    try {
      return json(req, { data: await handler(body, req) });
    } catch (err) {
      if (err instanceof ApiError) {
        return json(req, { error: { code: err.code, message: err.message, ...(err.details ?? {}) } }, err.status);
      }
      if (err instanceof ZodError) {
        // A malformed id is treated like an unknown one: nothing to probe.
        return json(req, { error: { code: "NOT_FOUND", message: "We couldn't find that session." } }, 404);
      }
      console.error("Unhandled error", err instanceof Error ? err.name : typeof err);
      return json(req, {
        error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side. Please try again in a moment." },
      }, 500);
    }
  };
}
