export const config = { runtime: 'edge' };

async function getValidToken(supabaseUrl, serviceKey, userId) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/calendar_tokens?user_id=eq.${userId}&select=access_token,refresh_token,expires_at`,
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
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { request_id, owner_id, title, start, end, notes, attendee_email } = body;
  if (!owner_id || !title || !start || !end) {
    return new Response(JSON.stringify({ error: 'Missing required fields: owner_id, title, start, end' }), { status: 400 });
  }

  const sUrl = process.env.SUPABASE_URL;
  const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = await getValidToken(sUrl, sKey, owner_id);

  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Google Calendar not connected' }), { status: 401 });
  }

  const event = {
    summary: title,
    description: notes || '',
    start: { dateTime: start, timeZone: 'America/Lima' },
    end:   { dateTime: end,   timeZone: 'America/Lima' },
    ...(attendee_email ? { attendees: [{ email: attendee_email }] } : {})
  };

  const evRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  const evData = await evRes.json();

  if (!evData.id) {
    return new Response(JSON.stringify({ error: 'Failed to create event', details: evData }), { status: 500 });
  }

  // Mark presence request as approved
  if (request_id) {
    await fetch(`${sUrl}/rest/v1/presence_requests?id=eq.${request_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sKey}`, 'apikey': sKey },
      body: JSON.stringify({ estado: 'aprobado', fecha_propuesta: start, google_event_id: evData.id })
    });
  }

  return new Response(JSON.stringify({ success: true, event_id: evData.id, event_link: evData.htmlLink }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
