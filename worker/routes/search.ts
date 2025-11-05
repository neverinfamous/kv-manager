import type { Env, APIResponse } from '../types';
import { getD1Binding } from '../utils/helpers';

export async function handleSearchRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  _userEmail: string // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/search - Search keys across namespaces
    if (url.pathname === '/api/search' && request.method === 'GET') {
      const query = url.searchParams.get('query') || '';
      const namespaceId = url.searchParams.get('namespaceId');
      const tagsParam = url.searchParams.get('tags');
      const tags = tagsParam ? tagsParam.split(',') : [];

      console.log('[Search] Searching with query:', query, 'namespace:', namespaceId, 'tags:', tags);

      if (isLocalDev || !db) {
        // Return mock search results
        const mockResults = [
          {
            namespace_id: 'mock-namespace-1',
            key_name: 'test-key-1',
            tags: ['mock', 'example'],
            custom_metadata: { environment: 'dev' }
          },
          {
            namespace_id: 'mock-namespace-1',
            key_name: 'config-key',
            tags: ['config', 'production'],
            custom_metadata: { version: '1.0' }
          }
        ];

        // Filter mock results based on query
        const filtered = mockResults.filter(result => {
          const matchesQuery = !query || result.key_name.includes(query);
          const matchesNamespace = !namespaceId || result.namespace_id === namespaceId;
          const matchesTags = tags.length === 0 || tags.some(tag => result.tags.includes(tag));
          return matchesQuery && matchesNamespace && matchesTags;
        });

        const response: APIResponse = {
          success: true,
          result: filtered
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Build SQL query
      let sql = 'SELECT namespace_id, key_name, tags, custom_metadata FROM key_metadata WHERE 1=1';
      const bindings: (string | null)[] = [];

      // Add query filter (key name pattern)
      if (query) {
        sql += ' AND key_name LIKE ?';
        bindings.push(`%${query}%`);
      }

      // Add namespace filter
      if (namespaceId) {
        sql += ' AND namespace_id = ?';
        bindings.push(namespaceId);
      }

      // Add tags filter (check if any tag matches)
      if (tags.length > 0) {
        const tagConditions = tags.map(() => 'tags LIKE ?').join(' OR ');
        sql += ` AND (${tagConditions})`;
        tags.forEach(tag => bindings.push(`%"${tag}"%`));
      }

      sql += ' ORDER BY updated_at DESC LIMIT 100';

      console.log('[Search] SQL:', sql, 'Bindings:', bindings);

      // Execute query
      const stmt = db.prepare(sql);
      const results = await stmt.bind(...bindings).all();

      // Parse JSON fields
      const parsedResults = (results.results || []).map((row: Record<string, unknown>) => ({
        namespace_id: row.namespace_id,
        key_name: row.key_name,
        tags: row.tags ? JSON.parse(row.tags as string) : [],
        custom_metadata: row.custom_metadata ? JSON.parse(row.custom_metadata as string) : {}
      }));

      const response: APIResponse = {
        success: true,
        result: parsedResults
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('[Search] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}

