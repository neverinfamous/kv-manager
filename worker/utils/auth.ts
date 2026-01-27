import type { Env } from "../types";
import {
  logInfo,
  logWarning,
  logError,
  createErrorContext,
} from "./error-logger";

/**
 * Validate Cloudflare Access JWT token
 * Returns user email if valid, null otherwise
 */
export async function validateAccessJWT(
  request: Request,
  env: Env,
): Promise<string | null> {
  const isLocalDev = new URL(request.url).hostname === "localhost";

  // Try to get JWT from header first, then from cookie
  let token = request.headers.get("cf-access-jwt-assertion");

  if (!token) {
    // Try to get from cookie
    const cookies = request.headers.get("cookie");
    if (cookies) {
      const match = cookies.match(/CF_Authorization=([^;]+)/);
      if (match) {
        const matchedToken = match[1];
        if (matchedToken) {
          token = matchedToken;
          logInfo(
            "JWT token found in cookie",
            createErrorContext("auth", "extract_token"),
          );
        }
      }
    }
  } else {
    logInfo(
      "JWT token found in header",
      createErrorContext("auth", "extract_token"),
    );
  }

  if (!token) {
    logWarning(
      "No JWT token found in request headers or cookies",
      createErrorContext("auth", "extract_token", {
        metadata: { availableHeaders: Array.from(request.headers.keys()) },
      }),
    );
    return null;
  }

  // Check if secrets are configured
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    await logError(
      env,
      "Missing TEAM_DOMAIN or POLICY_AUD secrets",
      createErrorContext("auth", "validate_config", {
        metadata: {
          teamDomainSet: Boolean(env.TEAM_DOMAIN),
          policyAudSet: Boolean(env.POLICY_AUD),
        },
      }),
      isLocalDev,
    );
    return null;
  }

  try {
    // Import jose dynamically for JWT validation
    const { jwtVerify, createRemoteJWKSet } = await import("jose");

    logInfo(
      "Validating JWT",
      createErrorContext("auth", "validate_jwt", {
        metadata: { teamDomain: env.TEAM_DOMAIN },
      }),
    );

    // Create JWKS endpoint for Cloudflare Access
    const JWKS = createRemoteJWKSet(
      new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`),
    );

    // Verify the JWT
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    });

    // Extract user email from payload
    const email = payload["email"];

    if (!email || typeof email !== "string") {
      logWarning(
        "JWT payload missing email",
        createErrorContext("auth", "validate_jwt"),
      );
      return null;
    }

    logInfo(
      "JWT validated successfully",
      createErrorContext("auth", "validate_jwt", {
        userId: email,
      }),
    );
    return email;
  } catch (error) {
    await logError(
      env,
      error instanceof Error ? error : String(error),
      createErrorContext("auth", "validate_jwt"),
      isLocalDev,
    );
    return null;
  }
}
