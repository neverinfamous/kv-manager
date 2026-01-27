import type { Env, APIResponse } from "../types";
import { getD1Binding } from "../utils/helpers";
import { logInfo, logError, createErrorContext } from "../utils/error-logger";

export async function handleSearchRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  _userEmail: string,
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/search - Search keys across namespaces
    if (url.pathname === "/api/search" && request.method === "GET") {
      const query = url.searchParams.get("query") || "";
      const namespaceId = url.searchParams.get("namespaceId");
      const tagsParam = url.searchParams.get("tags");
      const tags = tagsParam
        ? tagsParam
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      logInfo(
        "Searching keys",
        createErrorContext("search", "search_keys", {
          ...(namespaceId !== null && { namespaceId }),
          metadata: {
            query,
            tags,
            searchParams: Object.fromEntries(url.searchParams.entries()),
          },
        }),
      );

      if (isLocalDev || !db) {
        // Return mock search results
        const mockResults = [
          {
            namespace_id: "mock-namespace-1",
            key_name: "test-key-1",
            tags: ["mock", "example"],
            custom_metadata: { environment: "dev" },
          },
          {
            namespace_id: "mock-namespace-1",
            key_name: "config-key",
            tags: ["config", "production"],
            custom_metadata: { version: "1.0" },
          },
        ];

        // Filter mock results based on query
        const filtered = mockResults.filter((result) => {
          const matchesQuery = !query || result.key_name.includes(query);
          const matchesNamespace =
            !namespaceId || result.namespace_id === namespaceId;
          const matchesTags =
            tags.length === 0 || tags.some((tag) => result.tags.includes(tag));
          return matchesQuery && matchesNamespace && matchesTags;
        });

        const response: APIResponse = {
          success: true,
          result: filtered,
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Build SQL query - allow searching by query OR tags OR both
      let sql =
        "SELECT namespace_id, key_name, tags, custom_metadata FROM key_metadata";
      const bindings: (string | null)[] = [];
      const conditions: string[] = [];

      // Add query filter - search both key name AND tags
      if (query) {
        // Search key_name OR any tag containing the query
        conditions.push("(key_name LIKE ? OR tags LIKE ?)");
        bindings.push(`%${query}%`);
        bindings.push(`%${query}%`);
      }

      // Add namespace filter
      if (namespaceId) {
        conditions.push("namespace_id = ?");
        bindings.push(namespaceId);
      }

      // Add explicit tags filter (for when user wants to filter by specific tags)
      if (tags.length > 0) {
        const tagConditions = tags.map(() => "tags LIKE ?").join(" OR ");
        conditions.push(`(${tagConditions})`);
        tags.forEach((tag) => bindings.push(`%"${tag}"%`));
      }

      // Only add WHERE clause if there are conditions
      if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
      }

      sql += " ORDER BY updated_at DESC LIMIT 100";

      logInfo(
        "Executing search query",
        createErrorContext("search", "search_keys", {
          metadata: { sql, bindingsCount: bindings.length },
        }),
      );

      // Execute query
      const stmt = db.prepare(sql);
      const results = await stmt.bind(...bindings).all();

      logInfo(
        "D1 returned results",
        createErrorContext("search", "search_keys", {
          metadata: { resultCount: results.results?.length ?? 0 },
        }),
      );

      // Parse JSON fields
      const parsedResults = (results.results || []).map(
        (row: Record<string, unknown>) => ({
          namespace_id: row["namespace_id"],
          key_name: row["key_name"],
          tags: row["tags"] ? JSON.parse(row["tags"] as string) : [],
          custom_metadata: row["custom_metadata"]
            ? JSON.parse(row["custom_metadata"] as string)
            : {},
        }),
      );

      logInfo(
        "Parsed results",
        createErrorContext("search", "search_keys", {
          metadata: { parsedCount: parsedResults.length },
        }),
      );

      const response: APIResponse = {
        success: true,
        result: parsedResults,
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    await logError(
      env,
      error instanceof Error ? error : String(error),
      createErrorContext("search", "handle_request"),
      isLocalDev,
    );
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
