import type { Env } from '../types';

/**
 * Validate Cloudflare Access JWT token
 * Returns user email if valid, null otherwise
 */
export async function validateAccessJWT(request: Request, env: Env): Promise<string | null> {
  // Try to get JWT from header first, then from cookie
  let token = request.headers.get('cf-access-jwt-assertion');
  
  if (!token) {
    // Try to get from cookie
    const cookies = request.headers.get('cookie');
    if (cookies) {
      const match = cookies.match(/CF_Authorization=([^;]+)/);
      if (match) {
        token = match[1];
        console.log('[Auth] JWT token found in cookie');
      }
    }
  } else {
    console.log('[Auth] JWT token found in header');
  }
  
  if (!token) {
    console.log('[Auth] No JWT token found in request headers or cookies');
    console.log('[Auth] Available headers:', Array.from(request.headers.keys()));
    return null;
  }

  // Check if secrets are configured
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    console.error('[Auth] Missing TEAM_DOMAIN or POLICY_AUD secrets');
    console.error('[Auth] TEAM_DOMAIN:', env.TEAM_DOMAIN ? 'set' : 'not set');
    console.error('[Auth] POLICY_AUD:', env.POLICY_AUD ? 'set' : 'not set');
    return null;
  }

  try {
    // Import jose dynamically for JWT validation
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    
    console.log('[Auth] Validating JWT with TEAM_DOMAIN:', env.TEAM_DOMAIN);
    
    // Create JWKS endpoint for Cloudflare Access
    const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
    
    // Verify the JWT
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    });

    // Extract user email from payload
    const email = payload.email as string;
    
    if (!email) {
      console.log('[Auth] JWT payload missing email');
      return null;
    }

    console.log('[Auth] JWT validated for user:', email);
    return email;
    
  } catch (error) {
    console.error('[Auth] JWT validation failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

