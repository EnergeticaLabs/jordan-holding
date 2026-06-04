export const config = { runtime: 'edge' };

const APP_URL = 'https://virtualflow-holding.vercel.app';
const REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

async function upsertToken(supabaseUrl, serviceKey, userId, accessToken, refreshToken, expiresAt) {
  // Try update first
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/calendar_tokens?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, updated_at: new Date().toISOString() })
  });
  // If no row was updated, insert
  if (patchRes.status === 204 || patchRes.status === 200) {
    const count = patchRes.headers.get('content-range');
    if (count && count.startsWith('*/0')) {
      await fetch(`${supabaseUrl}/rest/v1/calendar_tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey
        },
        body: JSON.stringify({ user_id: userId, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt })
      });
    }
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // user_id
  const error = url.searchParams.get('error');

  if (error || !code || !state) {
    return Response.redirect(`${APP_URL}?gcal_error=${encodeURIComponent(error || 'missing_params')}`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return Response.redirect(`${APP_URL}?gcal_error=token_failed`);
    }

    const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
    await upsertToken(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      state,
      tokens.access_token,
      tokens.refresh_token || null,
      expiresAt
    );

    return Response.redirect(`${APP_URL}?gcal_connected=1`);
  } catch (e) {
    return Response.redirect(`${APP_URL}?gcal_error=server_error`);
  }
}
