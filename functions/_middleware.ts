// Cloudflare Pages Functions Middleware
// Validates Cloudflare Access JWT (Cf-Access-Jwt-Assertion) on all API routes

interface Env {
  DB: D1Database;
  CF_ACCESS_AUD?: string; // Access Application AUD (policy tag)
  CF_ACCESS_TEAM_DOMAIN?: string; // e.g., "tolonsolutions" for tolonsolutions.cloudflareaccess.com
}

interface Data extends Record<string, unknown> {
  userEmail: string;
}

interface JWTPayload {
  aud: string[];
  email?: string;
  iss: string;
  sub: string;
  iat: number;
  exp: number;
  type?: string; // "app" for service tokens
  common_name?: string; // service token name
}

interface JWK {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  e: string;
  n: string;
}

interface JWKS {
  keys: JWK[];
}

// Cache for JWKS (fetched once per isolate lifecycle)
let jwksCache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Fetch and cache JWKS from Cloudflare Access
async function getJWKS(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && (now - jwksCache.fetchedAt) < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }

  const certsUrl = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
  const response = await fetch(certsUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const jwks: JWKS = await response.json();
  const keys = new Map<string, CryptoKey>();

  for (const jwk of jwks.keys) {
    if (jwk.kty === 'RSA' && jwk.alg === 'RS256') {
      const cryptoKey = await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, e: jwk.e, n: jwk.n, alg: 'RS256' },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      keys.set(jwk.kid, cryptoKey);
    }
  }

  jwksCache = { keys, fetchedAt: now };
  return keys;
}

// Base64URL decode
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

// Verify and decode JWT
async function verifyAccessJWT(
  token: string,
  teamDomain: string,
  expectedAud: string
): Promise<JWTPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('JWT: Invalid format');
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header to get kid
  let header: { kid?: string; alg?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  } catch {
    console.error('JWT: Failed to decode header');
    return null;
  }

  if (!header.kid || header.alg !== 'RS256') {
    console.error('JWT: Missing kid or unsupported algorithm');
    return null;
  }

  // Get JWKS and find the key
  const keys = await getJWKS(teamDomain);
  const key = keys.get(header.kid);
  if (!key) {
    console.error('JWT: Key not found for kid:', header.kid);
    return null;
  }

  // Verify signature
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    signature.buffer as ArrayBuffer,
    signedData
  );

  if (!valid) {
    console.error('JWT: Invalid signature');
    return null;
  }

  // Decode and validate payload
  let payload: JWTPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    console.error('JWT: Failed to decode payload');
    return null;
  }

  // Validate issuer
  const expectedIssuer = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload.iss !== expectedIssuer) {
    console.error('JWT: Invalid issuer:', payload.iss);
    return null;
  }

  // Validate audience
  if (!payload.aud || !payload.aud.includes(expectedAud)) {
    console.error('JWT: Invalid audience:', payload.aud);
    return null;
  }

  // Validate expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    console.error('JWT: Token expired');
    return null;
  }

  return payload;
}

export const onRequest: PagesFunction<Env, string, Data> = async (context) => {
  const { request, next, data, env } = context;
  const url = new URL(request.url);

  // Only protect /api/* routes
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  // Get the JWT from the header
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');

  // For local development without Access
  if (!jwt) {
    const devEmail = request.headers.get('X-Dev-User-Email');
    if (devEmail) {
      data.userEmail = devEmail;
      return next();
    }
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get required env vars
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const expectedAud = env.CF_ACCESS_AUD;

  if (!teamDomain || !expectedAud) {
    console.error('Missing CF_ACCESS_TEAM_DOMAIN or CF_ACCESS_AUD env vars');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verify the JWT
  const payload = await verifyAccessJWT(jwt, teamDomain, expectedAud);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Set user identity
  if (payload.type === 'app') {
    // Service token
    data.userEmail = `service-token:${payload.common_name || payload.sub}`;
  } else if (payload.email) {
    // User token
    data.userEmail = payload.email;
  } else {
    data.userEmail = payload.sub;
  }

  return next();
};
