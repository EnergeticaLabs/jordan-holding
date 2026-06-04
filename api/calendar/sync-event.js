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
  const sUrl = process.env.SUPABASE_URL;
  const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // DELETE — eliminar evento de GCal
  if (req.method === 'DELETE') {
    let body;
    try { body = await req.json(); } catch { return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); }
    const { userId, gcalEventId } = body;
    if (!userId || !gcalEventId) return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    const token = await getValidToken(sUrl, sKey, userId);
    if (!token) return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gcalEventId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  }

  // POST — crear o actualizar evento en GCal
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { userId, gcalEventId, titulo, inicio, fin, notas, recurrencia, recordatorios } = body;
  if (!userId || !titulo || !inicio || !fin) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }

  const token = await getValidToken(sUrl, sKey, userId);
  if (!token) return new Response(JSON.stringify({ error: 'GCal not connected' }), { status: 401 });

  // Construir objeto evento GCal
  const gcalEvent = {
    summary: titulo,
    description: notas || '',
    start: { dateTime: inicio, timeZone: 'America/Lima' },
    end:   { dateTime: fin,   timeZone: 'America/Lima' },
  };

  // Recurrencia
  if (recurrencia && recurrencia !== 'none') {
    gcalEvent.recurrence = [`RRULE:FREQ=${recurrencia}`];
  }

  // Recordatorios (array de minutos)
  const remArray = Array.isArray(recordatorios) ? recordatorios.filter(m => Number.isFinite(m) && m > 0) : [];
  if (remArray.length > 0) {
    gcalEvent.reminders = {
      useDefault: false,
      overrides: remArray.map(min => [
        { method: 'popup', minutes: min },
        { method: 'email', minutes: min }
      ]).flat()
    };
  } else {
    gcalEvent.reminders = { useDefault: false, overrides: [] };
  }

  let evRes, evData;
  if (gcalEventId) {
    // Actualizar evento existente
    evRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gcalEventId)}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(gcalEvent)
    });
  } else {
    // Crear nuevo evento
    evRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(gcalEvent)
    });
  }

  evData = await evRes.json();
  if (!evData.id) {
    return new Response(JSON.stringify({ error: 'GCal error', details: evData }), { status: 500 });
  }

  return new Response(JSON.stringify({ gcalEventId: evData.id }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
