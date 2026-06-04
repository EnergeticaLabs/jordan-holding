export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('user_id');
  if (!userId) {
    return new Response(JSON.stringify({ connected: false }), { headers: { 'Content-Type': 'application/json' } });
  }

  const sUrl = process.env.SUPABASE_URL;
  const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(
    `${sUrl}/rest/v1/calendar_tokens?user_id=eq.${userId}&select=user_id&limit=1`,
    { headers: { 'Authorization': `Bearer ${sKey}`, 'apikey': sKey } }
  );
  const rows = await res.json();
  return new Response(JSON.stringify({ connected: Array.isArray(rows) && rows.length > 0 }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
