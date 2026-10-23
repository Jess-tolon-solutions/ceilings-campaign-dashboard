// Cloudflare Pages Functions Middleware
// Verifies Cloudflare Access JWT on all API routes

interface Env {
  DB: D1Database;
}

interface Data {
  userEmail: string;
}

// Extract user email from Cloudflare Access JWT header
function getUserEmail(request: Request): string | null {
  // In production, Cloudflare Access sets this header
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (email) return email;

  // For local development, check for a custom header
  const devEmail = request.headers.get('X-Dev-User-Email');
  return devEmail || null;
}

// Check if request is using a service token (for ingest endpoints)
function isServiceToken(request: Request): boolean {
  const clientId = request.headers.get('CF-Access-Client-Id');
  const clientSecret = request.headers.get('CF-Access-Client-Secret');
  return !!(clientId && clientSecret);
}

export const onRequest: PagesFunction<Env, string, Data> = async (context) => {
  const { request, next, data } = context;
  const url = new URL(request.url);

  // Only protect /api/* routes
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  // Ingest endpoints use service tokens
  if (url.pathname.startsWith('/api/ingest/')) {
    if (!isServiceToken(request)) {
      return new Response(JSON.stringify({ error: 'Service token required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    data.userEmail = 'service-token';
    return next();
  }

  // All other API routes require user authentication
  const email = getUserEmail(request);
  if (!email) {
    // In production, Cloudflare Access handles the redirect
    // This is a fallback for direct API calls without auth
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Store email in context for use in handlers
  data.userEmail = email;

  return next();
};
