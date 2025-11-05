/**
 * Get CORS headers for API responses
 */
export function getCorsHeaders(request: Request): HeadersInit {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  
  // Allow localhost for development
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const isLocalhostOrigin = origin.includes('localhost') || origin.includes('127.0.0.1');
  
  // In production, validate origin against allowed domains
  // For now, allow all origins (can be tightened based on requirements)
  const allowCredentials = true;
  
  return {
    'Access-Control-Allow-Origin': (isLocalhost || isLocalhostOrigin) ? origin : (origin || url.origin),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, cf-access-jwt-assertion',
    'Access-Control-Allow-Credentials': allowCredentials ? 'true' : 'false',
    'Vary': 'Origin'
  };
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflightRequest(corsHeaders: HeadersInit): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

/**
 * Check if request is from localhost (development mode)
 */
export function isLocalDevelopment(request: Request): boolean {
  const url = new URL(request.url);
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

