import type { Env, APIResponse } from '../types';
import { getD1Binding } from '../utils/helpers';

export async function handleAuditRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  _userEmail: string // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/audit/:namespaceId - Get audit log for namespace
    const namespaceMatch = url.pathname.match(/^\/api\/audit\/([^/]+)$/);
    if (namespaceMatch && request.method === 'GET') {
      const namespaceId = namespaceMatch[1];
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const operationType = url.searchParams.get('operation');

      console.log('[Audit] Getting audit log for namespace:', namespaceId, 'limit:', limit, 'offset:', offset);

      if (isLocalDev || !db) {
        // Return mock audit log
        const mockAuditLog = [
          {
            id: 1,
            namespace_id: namespaceId,
            key_name: 'test-key-1',
            operation: 'create',
            user_email: 'user@example.com',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            details: JSON.stringify({ source: 'web' })
          },
          {
            id: 2,
            namespace_id: namespaceId,
            key_name: 'test-key-2',
            operation: 'update',
            user_email: 'user@example.com',
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            details: JSON.stringify({ backup_created: true })
          },
          {
            id: 3,
            namespace_id: namespaceId,
            key_name: null,
            operation: 'bulk_delete',
            user_email: 'admin@example.com',
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            details: JSON.stringify({ key_count: 10 })
          }
        ];

        const filtered = operationType 
          ? mockAuditLog.filter(log => log.operation === operationType)
          : mockAuditLog;

        const response: APIResponse = {
          success: true,
          result: filtered.slice(offset, offset + limit)
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Build query
      let sql = 'SELECT * FROM audit_log WHERE namespace_id = ?';
      const bindings: (string | number)[] = [namespaceId];

      if (operationType) {
        sql += ' AND operation = ?';
        bindings.push(operationType);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      bindings.push(limit, offset);

      const results = await db.prepare(sql).bind(...bindings).all();

      const response: APIResponse = {
        success: true,
        result: results.results || []
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // GET /api/audit/user/:userEmail - Get audit log for user
    const userMatch = url.pathname.match(/^\/api\/audit\/user\/([^/]+)$/);
    if (userMatch && request.method === 'GET') {
      const targetUserEmail = decodeURIComponent(userMatch[1]);
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const operationType = url.searchParams.get('operation');

      console.log('[Audit] Getting audit log for user:', targetUserEmail, 'limit:', limit, 'offset:', offset);

      if (isLocalDev || !db) {
        // Return mock audit log
        const mockAuditLog = [
          {
            id: 1,
            namespace_id: 'mock-namespace-1',
            key_name: 'test-key-1',
            operation: 'create',
            user_email: targetUserEmail,
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            details: JSON.stringify({ source: 'web' })
          },
          {
            id: 2,
            namespace_id: 'mock-namespace-2',
            key_name: 'config-key',
            operation: 'update',
            user_email: targetUserEmail,
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            details: JSON.stringify({ backup_created: true })
          }
        ];

        const filtered = operationType 
          ? mockAuditLog.filter(log => log.operation === operationType)
          : mockAuditLog;

        const response: APIResponse = {
          success: true,
          result: filtered.slice(offset, offset + limit)
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Build query
      let sql = 'SELECT * FROM audit_log WHERE user_email = ?';
      const bindings: (string | number)[] = [targetUserEmail];

      if (operationType) {
        sql += ' AND operation = ?';
        bindings.push(operationType);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      bindings.push(limit, offset);

      const results = await db.prepare(sql).bind(...bindings).all();

      const response: APIResponse = {
        success: true,
        result: results.results || []
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
    console.error('[Audit] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}

