import { json, requireSignalOwner, rest } from '../lib/server/signal-auth.js';
import { analyzeSignal } from '../lib/server/signal-analysis.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const { context, error } = await requireSignalOwner(req);
  if (error) return error;

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Solicitud inválida' }, 400); }
  if (typeof body?.signal_id !== 'string') return json({ error: 'Falta signal_id' }, 400);

  const owner = `created_by=eq.${encodeURIComponent(context.profile.id)}`;
  const { response: signalResponse, data: signalRows } = await rest(
    context,
    `signals?${owner}&id=eq.${encodeURIComponent(body.signal_id)}&select=id,title,content,source,source_url,created_by&limit=1`
  );
  const signal = signalRows?.[0];
  if (!signalResponse.ok) return json({ error: 'No se pudo cargar la señal' }, 502);
  if (!signal) return json({ error: 'Señal no encontrada' }, 404);

  const [venturesResult, tasksResult, usersResult] = await Promise.all([
    rest(context, 'ventures?select=id,nombre,estado,descripcion&order=orden&limit=100'),
    rest(context, 'tasks?select=id,titulo,venture_id,asignado_a,estado,prioridad,fecha_limite&limit=80'),
    rest(context, 'users?select=id,nombre,rol&order=nombre&limit=100')
  ]);
  if (!venturesResult.response.ok || !tasksResult.response.ok || !usersResult.response.ok) {
    return json({ error: 'No se pudo cargar el contexto del Holding' }, 502);
  }

  const ventures = venturesResult.data || [];
  const tasks = tasksResult.data || [];
  const users = usersResult.data || [];
  let analysis;
  try {
    analysis = await analyzeSignal({ signal, ventures, tasks, users });
  } catch (error) {
    const status = error.message === 'AI_NOT_CONFIGURED' ? 503 : 502;
    return json({ error: status === 503 ? 'El análisis no está configurado' : 'No se pudo analizar la señal' }, status);
  }

  const { response: updateResponse } = await rest(
    context,
    `signals?${owner}&id=eq.${encodeURIComponent(signal.id)}`,
    { method: 'PATCH', body: { analysis, analyzed_at: new Date().toISOString(), status: 'analyzed' }, prefer: 'return=minimal' }
  );
  if (!updateResponse.ok) return json({ error: 'No se pudo guardar el análisis' }, 502);
  return json({ signal_id: signal.id, analysis });
}