/**
 * Namespace Color Routes
 *
 * API endpoints for managing namespace color tags for visual organization.
 */

import type { Env, CorsHeaders, ErrorContext } from "../types";
import { logInfo, logWarning } from "../utils/error-logger";

/**
 * Helper to create JSON response headers
 */
function jsonHeaders(corsHeaders: CorsHeaders): Headers {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  return headers;
}

/**
 * Helper to create error context
 */
function createContext(
  module: string,
  operation: string,
  userEmail: string | null,
  metadata?: Record<string, unknown>,
): ErrorContext {
  const ctx: ErrorContext = { module, operation };
  if (userEmail) {
    ctx["userId"] = userEmail;
  }
  if (metadata) {
    ctx["metadata"] = metadata;
  }
  return ctx;
}

/**
 * Valid color options for namespace colors
 */
export type NamespaceColor =
  | "red"
  | "red-light"
  | "red-dark"
  | "orange"
  | "orange-light"
  | "amber"
  | "yellow"
  | "yellow-light"
  | "lime"
  | "green"
  | "green-light"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "blue-light"
  | "indigo"
  | "purple"
  | "violet"
  | "fuchsia"
  | "pink"
  | "rose"
  | "pink-light"
  | "gray"
  | "slate"
  | "zinc"
  | null;

const VALID_COLORS = [
  // Reds & Pinks
  "red",
  "red-light",
  "red-dark",
  "rose",
  "pink-light",
  "pink",
  // Oranges & Yellows
  "orange",
  "orange-light",
  "amber",
  "yellow",
  "yellow-light",
  "lime",
  // Greens & Teals
  "green",
  "green-light",
  "emerald",
  "teal",
  "cyan",
  "sky",
  // Blues & Purples
  "blue",
  "blue-light",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  // Neutrals
  "slate",
  "gray",
  "zinc",
];

/**
 * Body type for color updates
 */
interface ColorBody {
  color: string | null;
}

/**
 * Color record from the database
 */
interface ColorRecord {
  namespace_id: string;
  color: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Handle color-related API routes
 *
 * Routes:
 * - GET /api/namespaces/colors - Get all namespace colors
 * - PUT /api/namespaces/:id/color - Update namespace color
 */
export async function handleColorRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  userEmail: string | null,
): Promise<Response | null> {
  const db = env.METADATA;

  // GET /api/namespaces/colors - Get all namespace colors
  if (request.method === "GET" && url.pathname === "/api/namespaces/colors") {
    logInfo(
      "Getting all namespace colors",
      createContext("colors", "list", userEmail),
    );

    if (isLocalDev) {
      // Mock response for local development
      return new Response(
        JSON.stringify({
          result: {
            "mock-ns-1": "blue",
            "mock-ns-2": "green",
          },
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    try {
      const result = await db
        .prepare("SELECT namespace_id, color FROM namespace_colors")
        .all<ColorRecord>();

      // Convert to object map
      const colorMap: Record<string, string> = {};
      for (const row of result.results) {
        colorMap[row.namespace_id] = row.color;
      }

      return new Response(
        JSON.stringify({
          result: colorMap,
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logWarning(
        `[NS_COLOR_LIST_FAILED] Failed to get colors: ${errorMessage}`,
        createContext("colors", "list", userEmail),
      );

      // Return empty map on error (table might not exist yet)
      return new Response(
        JSON.stringify({
          result: {},
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }
  }

  // PUT /api/namespaces/:id/color - Update namespace color
  if (
    request.method === "PUT" &&
    /^\/api\/namespaces\/[^/]+\/color$/.exec(url.pathname)
  ) {
    const namespaceId = url.pathname.split("/")[3];
    logInfo(
      `Updating color for namespace: ${namespaceId ?? "unknown"}`,
      createContext("colors", "update", userEmail, { namespaceId }),
    );

    const body: ColorBody = await request.json();
    const color = body.color;

    // Validate color
    if (color !== null && !VALID_COLORS.includes(color)) {
      return new Response(
        JSON.stringify({
          error: "Invalid color",
          message: `Color must be one of: ${VALID_COLORS.join(", ")}, or null`,
          success: false,
        }),
        {
          status: 400,
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    if (isLocalDev) {
      // Mock response for local development
      return new Response(
        JSON.stringify({
          result: { namespace_id: namespaceId, color },
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    try {
      if (color === null) {
        // Remove color
        await db
          .prepare("DELETE FROM namespace_colors WHERE namespace_id = ?")
          .bind(namespaceId)
          .run();
      } else {
        // Upsert color
        await db
          .prepare(
            `INSERT INTO namespace_colors (namespace_id, color, updated_at, updated_by)
                     VALUES (?, ?, datetime('now'), ?)
                     ON CONFLICT(namespace_id) DO UPDATE SET
                       color = excluded.color,
                       updated_at = excluded.updated_at,
                       updated_by = excluded.updated_by`,
          )
          .bind(namespaceId, color, userEmail)
          .run();
      }

      return new Response(
        JSON.stringify({
          result: { namespace_id: namespaceId, color },
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logWarning(
        `[NS_COLOR_UPDATE_FAILED] Failed to update color: ${errorMessage}`,
        createContext("colors", "update", userEmail, { namespaceId }),
      );

      // Check if error is due to missing table (user needs to run migration)
      if (errorMessage.includes("no such table: namespace_colors")) {
        return new Response(
          JSON.stringify({
            error: "Database upgrade required",
            message:
              "The namespace colors feature requires a schema update. Please use the in-app migration banner to upgrade.",
            requiresUpgrade: true,
            success: false,
          }),
          {
            status: 503,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: "Failed to update color",
          message:
            "An unexpected error occurred while updating the namespace color. Please try again.",
          success: false,
        }),
        {
          status: 500,
          headers: jsonHeaders(corsHeaders),
        },
      );
    }
  }

  // GET /api/keys/:namespaceId/colors - Get all key colors for a namespace
  if (
    request.method === "GET" &&
    /^\/api\/keys\/[^/]+\/colors$/.exec(url.pathname)
  ) {
    const namespaceId = url.pathname.split("/")[3];
    logInfo(
      `Getting key colors for namespace: ${namespaceId ?? "unknown"}`,
      createContext("colors", "list_keys", userEmail, { namespaceId }),
    );

    if (isLocalDev) {
      // Mock response for local development
      return new Response(
        JSON.stringify({
          result: {
            demo_key_1: "red",
            demo_key_2: "blue",
          },
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    try {
      const result = await db
        .prepare(
          "SELECT key_name, color FROM key_colors WHERE namespace_id = ?",
        )
        .bind(namespaceId)
        .all<{ key_name: string; color: string }>();

      // Convert to object map
      const colorMap: Record<string, string> = {};
      for (const row of result.results) {
        colorMap[row.key_name] = row.color;
      }

      return new Response(
        JSON.stringify({
          result: colorMap,
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logWarning(
        `[KEY_COLOR_LIST_FAILED] Failed to get key colors: ${errorMessage}`,
        createContext("colors", "list_keys", userEmail, { namespaceId }),
      );

      // Return empty map on error (table might not exist yet)
      return new Response(
        JSON.stringify({
          result: {},
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }
  }

  // PUT /api/keys/:namespaceId/:keyName/color - Update key color
  if (
    request.method === "PUT" &&
    /^\/api\/keys\/[^/]+\/[^/]+\/color$/.exec(url.pathname)
  ) {
    const parts = url.pathname.split("/");
    const namespaceId = parts[3];
    const keyName = decodeURIComponent(parts[4] ?? "");
    logInfo(
      `Updating color for key: ${keyName}`,
      createContext("colors", "update_key", userEmail, {
        namespaceId,
        keyName,
      }),
    );

    const body: ColorBody = await request.json();
    const color = body.color;

    // Validate color
    if (color !== null && !VALID_COLORS.includes(color)) {
      return new Response(
        JSON.stringify({
          error: "Invalid color",
          message: `Color must be one of: ${VALID_COLORS.join(", ")}, or null`,
          success: false,
        }),
        {
          status: 400,
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    if (isLocalDev) {
      // Mock response for local development
      return new Response(
        JSON.stringify({
          result: { namespace_id: namespaceId, key_name: keyName, color },
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    }

    try {
      if (color === null) {
        // Remove color
        await db
          .prepare(
            "DELETE FROM key_colors WHERE namespace_id = ? AND key_name = ?",
          )
          .bind(namespaceId, keyName)
          .run();
      } else {
        // Upsert color
        await db
          .prepare(
            `INSERT INTO key_colors (namespace_id, key_name, color, updated_at, updated_by)
                     VALUES (?, ?, ?, datetime('now'), ?)
                     ON CONFLICT(namespace_id, key_name) DO UPDATE SET
                       color = excluded.color,
                       updated_at = excluded.updated_at,
                       updated_by = excluded.updated_by`,
          )
          .bind(namespaceId, keyName, color, userEmail)
          .run();
      }

      return new Response(
        JSON.stringify({
          result: { namespace_id: namespaceId, key_name: keyName, color },
          success: true,
        }),
        {
          headers: jsonHeaders(corsHeaders),
        },
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logWarning(
        `[KEY_COLOR_UPDATE_FAILED] Failed to update key color: ${errorMessage}`,
        createContext("colors", "update_key", userEmail, {
          namespaceId,
          keyName,
        }),
      );

      // Check if error is due to missing table
      if (errorMessage.includes("no such table: key_colors")) {
        return new Response(
          JSON.stringify({
            error: "Database upgrade required",
            message:
              "The key colors feature requires a schema update. Please use the in-app migration banner to upgrade.",
            requiresUpgrade: true,
            success: false,
          }),
          {
            status: 503,
            headers: jsonHeaders(corsHeaders),
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: "Failed to update key color",
          message:
            "An unexpected error occurred while updating the key color. Please try again.",
          success: false,
        }),
        {
          status: 500,
          headers: jsonHeaders(corsHeaders),
        },
      );
    }
  }

  // Route not handled
  return null;
}
