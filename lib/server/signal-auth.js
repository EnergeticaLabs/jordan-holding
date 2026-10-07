export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function requireSignalOwner(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = req.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { error: json({ error: 'Servicio no configurado' }, 500) };
  }
  if (!token) return { error: json({ error: 'No autenticado' }, 401) };

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
  });
  if (!authResponse.ok) return { error: json({ error: 'No autenticado' }, 401) };
  const authUser = await authResponse.json();

  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/users?auth_id=eq.${encodeURIComponent(authUser.id)}&select=id,rol&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!profileResponse.ok) return { error: json({ error: 'No se pudo validar el perfil' }, 500) };
  const profiles = await profileResponse.json();
  const profile = profiles[0];
  if (!profile || profile.rol !== 'owner') {
    return { error: json({ error: 'Acceso no autorizado' }, 403) };
  }

  return { context: { supabaseUrl, serviceKey, profile, authUser } };
}

export async function rest(context, path, options = {}) {
  const headers = {
    apikey: context.serviceKey,
    Authorization: `Bearer ${context.serviceKey}`,
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.prefer ? { Prefer: options.prefer } : {})
  };
  const response = await fetch(`${context.supabaseUrl}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { response, data };
}

export function validHttpUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}