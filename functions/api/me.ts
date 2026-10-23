// GET /api/me - Returns the authenticated user's email

interface Env {
  DB: D1Database;
}

interface Data {
  userEmail: string;
}

export const onRequestGet: PagesFunction<Env, string, Data> = async (context) => {
  return new Response(JSON.stringify({
    email: context.data.userEmail
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
