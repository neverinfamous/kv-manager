import type { Env } from '../types';

/**
 * Validate Cloudflare Access JWT token
 * Returns user email if valid, null otherwise
 */
export async function validateAccessJWT(request: Request, env: Env): Promise<string | null> {
  const token = request.headers.get('cf-access-jwt-assertion');
  
  if (!token) {
    console.log('[Auth] No JWT token found in request headers');
    return null;
  }

  try {
    // Import jose dynamically for JWT validation
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    
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

