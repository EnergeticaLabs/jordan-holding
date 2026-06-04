export const config = { runtime: 'edge' };

async function getValidToken(supabaseUrl, serviceKey, userId) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/calendar_tokens?user_id=eq.${userId}&select=access_token,refresh_token,expires_at&limit=1`,
    { headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey } }
  );
  const rows = await res.json();
  const row = rows[0];
  if (!row) return null;
  if (Date.now() < row.expires_at - 120000) return row.access_token;
  if (!row.refresh_token) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });
  const refreshed = await r.json();
  if (!refreshed.access_token) return null;
  await fetch(`${supabaseUrl}/rest/v1/calendar_tokens?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
    body: JSON.stringify({ access_token: refreshed.access_token, expires_at: Date.now() + (refreshed.expires_in || 3600) * 1000, updated_at: new Date().toISOString() })
  });
  return refreshed.access_token;
}

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  const url = new URL(req.url);
  const userId   = url.searchParams.get('user_id');
  const timeMin  = url.searchParams.get('time_min');
  const timeMax  = url.searchParams.get('time_max');
  if (!userId || !timeMin || !timeMax) {
    return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const sUrl = process.env.SUPABASE_URL;
  const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = await getValidToken(sUrl, sKey, userId);
  if (!accessToken) {
    return new Response(JSON.stringify({ connected: false, events: [] }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Get all selected calendars
  let calIds = ['primary'];
  try {
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=25', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const list = await listRes.json();
    if (list.items?.length) {
      calIds = list.items.filter(c => c.selected !== false && !c.deleted).map(c => c.id).slice(0, 10);
    }
  } catch (_) {}

  const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });

  const results = await Promise.allSettled(
    calIds.map(calId =>
      fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json())
    )
  );

  const seen = new Set();
  const events = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const ev of (r.value.items || [])) {
      if (ev.status === 'cancelled' || seen.has(ev.id)) continue;
      if (!ev.start?.dateTime && !ev.start?.date) continue;
      seen.add(ev.id);
      events.push({
        id: ev.id,
        title: ev.summary || '(Sin título)',
        start: ev.start.dateTime || ev.start.date,
        end:   ev.end?.dateTime  || ev.end?.date  || ev.start.dateTime || ev.start.date,
        allDay: !ev.start.dateTime,
        color: ev.colorId || null
      });
    }
  }

  return new Response(JSON.stringify({ connected: true, events }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
