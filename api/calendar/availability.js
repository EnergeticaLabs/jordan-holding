export const config = { runtime: 'edge' };

async function getValidToken(supabaseUrl, serviceKey, userId) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/calendar_tokens?user_id=eq.${userId}&select=access_token,refresh_token,expires_at`,
    { headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey } }
  );
  const rows = await res.json();
  const row = rows[0];
  if (!row) return null;

  // Token still valid
  if (Date.now() < row.expires_at - 120000) return row.access_token;
  if (!row.refresh_token) return null;

  // Refresh
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey
    },
    body: JSON.stringify({
      access_token: refreshed.access_token,
      expires_at: Date.now() + (refreshed.expires_in || 3600) * 1000,
      updated_at: new Date().toISOString()
    })
  });
  return refreshed.access_token;
}

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });

  const url = new URL(req.url);
  const ownerId = url.searchParams.get('owner_id');
  const durationMin = Math.max(15, Math.min(240, parseInt(url.searchParams.get('duration_min') || '60')));
  const days = Math.max(1, Math.min(14, parseInt(url.searchParams.get('days') || '7')));

  if (!ownerId) {
    return new Response(JSON.stringify({ error: 'owner_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const sUrl = process.env.SUPABASE_URL;
  const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = await getValidToken(sUrl, sKey, ownerId);

  if (!accessToken) {
    return new Response(JSON.stringify({ connected: false, slots: [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get all selected calendars
  let calendarIds = [{ id: 'primary' }];
  try {
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const list = await listRes.json();
    if (list.items?.length) {
      calendarIds = list.items.filter(c => c.selected !== false).map(c => ({ id: c.id }));
    }
  } catch (_) {}

  const tz = 'America/Lima';
  // Lima is UTC-5. Use explicit offset arithmetic so the Edge runtime (UTC) is not affected.
  const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;
  // Start of today in Lima time (midnight Lima = midnight UTC+LIMA_OFFSET)
  const nowUtc = Date.now();
  const todayLimaMs = Math.floor((nowUtc + LIMA_OFFSET_MS) / 86400000) * 86400000 - LIMA_OFFSET_MS;
  const timeMin = new Date(todayLimaMs);
  const timeMax = new Date(todayLimaMs + days * 86400000);

  let busyPeriods = [];
  try {
    const fbRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarIds,
        timeZone: tz
      })
    });
    const fbData = await fbRes.json();
    for (const cal of Object.values(fbData.calendars || {})) {
      for (const p of (cal.busy || [])) {
        busyPeriods.push({ start: new Date(p.start).getTime(), end: new Date(p.end).getTime() });
      }
    }
  } catch (_) {}

  // Sort + merge overlapping busy periods
  busyPeriods.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const p of busyPeriods) {
    if (merged.length && p.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, p.end);
    } else {
      merged.push({ ...p });
    }
  }

  // Find free slots every day 7am-11pm Lima, advance by 30min.
  // dayMidnightUtc = midnight Lima expressed in UTC ms (e.g. 05:00 UTC for Lima UTC-5).
  // To get 7am Lima: add 7h to that; to get 11pm Lima: add 23h.
  const SLOT_START_H = 7;
  const SLOT_END_H   = 23;
  const slots = [];
  const dur = durationMin * 60000;
  const minStart = Date.now() + 3600000; // at least 1h from now

  for (let d = 0; d < days; d++) {
    const dayMidnightUtc = todayLimaMs + d * 86400000;
    const dayStart = dayMidnightUtc + SLOT_START_H * 3600000;
    const dayEnd   = dayMidnightUtc + SLOT_END_H   * 3600000;
    let t = Math.max(dayStart, minStart);

    while (t + dur <= dayEnd) {
      const blocked = merged.some(b => t < b.end && (t + dur) > b.start);
      if (!blocked) {
        const s = new Date(t), e = new Date(t + dur);
        const fmt    = (dt) => dt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
        const fmtDay = s.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
        const dayKey = s.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz });
        slots.push({
          start: s.toISOString(),
          end: e.toISOString(),
          label: `${fmt(s)} – ${fmt(e)}`,
          dayLabel: fmtDay,
          dayKey,
        });
      }
      t += 30 * 60000;
    }
  }

  return new Response(JSON.stringify({ connected: true, slots }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
