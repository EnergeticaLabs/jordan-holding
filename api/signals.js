import { json, readJson, requireSignalOwner, rest, validHttpUrl } from '../lib/server/signal-auth.js';

export const config = { runtime: 'edge' };

const SIGNAL_FIELDS = 'id,title,content,source,source_url,signal_type,status,created_at,analyzed_at,analysis,created_by';

export default async function handler(req) {
  const { context, error } = await requireSignalOwner(req);
  if (error) return error;

  const url = new URL(req.url);
  const signalId = url.searchParams.get('id');
  const ownerFilter = `created_by=eq.${encodeURIComponent(context.profile.id)}`;

  if (req.method === 'GET') {
    const filter = signalId
      ? `${ownerFilter}&id=eq.${encodeURIComponent(signalId)}`
      : `${ownerFilter}&order=created_at.desc&limit=100`;
    const { response, data } = await rest(context, `signals?${filter}&select=${SIGNAL_FIELDS}`);
    if (!response.ok) return json({ error: 'No se pudieron cargar las señales' }, 502);
    if (signalId && !data?.length) return json({ error: 'Señal no encontrada' }, 404);
    return json(signalId ? data[0] : data || []);
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    if (!body || typeof body.content !== 'string') return json({ error: 'Contenido requerido' }, 400);
    const content = body.content.trim();
    if (!content || content.length > 50000) return json({ error: 'El contenido debe tener entre 1 y 50000 caracteres' }, 400);

    const suppliedTitle = typeof body.title === 'string' ? body.title.trim() : '';
    const title = (suppliedTitle || content.split('\n').find(line => line.trim()) || 'Señal sin título').trim().slice(0, 180);
    const source = typeof body.source === 'string' ? body.source.trim().slice(0, 160) : '';
    const sourceUrl = typeof body.source_url === 'string' ? body.source_url.trim().slice(0, 2048) : '';
    if (!validHttpUrl(sourceUrl)) return json({ error: 'La URL debe usar HTTP o HTTPS' }, 400);

    const record = {
      title,
      content,
      source: source || null,
      source_url: sourceUrl || null,
      signal_type: typeof body.signal_type === 'string' ? body.signal_type.trim().slice(0, 60) || null : null,
      status: 'inbox',
      created_by: context.profile.id
    };
    const { response, data } = await rest(context, `signals?select=${SIGNAL_FIELDS}`, {
      method: 'POST',
      body: record,
      prefer: 'return=representation'
    });
    if (!response.ok || !data?.[0]) return json({ error: 'No se pudo guardar la señal' }, 502);
    return json(data[0], 201);
  }

  if (req.method === 'PATCH') {
    if (!signalId) return json({ error: 'Falta el ID de la señal' }, 400);
    const body = await readJson(req);
    if (!body || typeof body !== 'object') return json({ error: 'Solicitud inválida' }, 400);
    const { response: existingResponse, data: existingRows } = await rest(
      context,
      `signals?${ownerFilter}&id=eq.${encodeURIComponent(signalId)}&select=id,analysis,status&limit=1`
    );
    const existing = existingRows?.[0];
    if (!existingResponse.ok) return json({ error: 'No se pudo cargar la señal' }, 502);
    if (!existing) return json({ error: 'Señal no encontrada' }, 404);

    let update;
    if (body.action === 'set-proposal-status') {
      const allowedTypes = ['proposedTasks', 'proposedProjects', 'proposedOpportunities', 'proposedResearch', 'proposedContent', 'knowledgeSuggestions'];
      const array = allowedTypes.includes(body.proposalType) ? body.proposalType : null;
        if (!array || !['rejected', 'pending', 'approved'].includes(body.status) ||
          (array === 'proposedTasks' && body.status === 'approved') || typeof body.proposalId !== 'string') {
        return json({ error: 'Actualización de propuesta inválida' }, 400);
      }
      const analysis = existing.analysis && typeof existing.analysis === 'object' ? structuredClone(existing.analysis) : {};
      const proposal = Array.isArray(analysis[array]) ? analysis[array].find(item => item.id === body.proposalId) : null;
      if (!proposal) return json({ error: 'Propuesta no encontrada' }, 404);
      const editableFields = {
        proposedTasks: ['title', 'description'],
        proposedProjects: ['title', 'description', 'reason'],
        proposedOpportunities: ['title', 'description', 'reason'],
        proposedResearch: ['question', 'reason', 'data_needed', 'possible_outcome'],
        proposedContent: ['title', 'format', 'audience', 'angle', 'reason'],
        knowledgeSuggestions: ['title', 'description', 'reason']
      };
      if (body.edits && typeof body.edits === 'object') {
        for (const field of editableFields[array]) {
          if (typeof body.edits[field] === 'string') proposal[field] = body.edits[field].trim().slice(0, 1200);
        }
      }
      proposal.status = body.status;
      update = { analysis };
    } else if (body.action === 'archive') {
      update = { status: 'archived' };
    } else {
      return json({ error: 'Acción no permitida' }, 400);
    }

    const { response } = await rest(
      context,
      `signals?${ownerFilter}&id=eq.${encodeURIComponent(signalId)}`,
      { method: 'PATCH', body: update, prefer: 'return=minimal' }
    );
    if (!response.ok) return json({ error: 'No se pudo actualizar la señal' }, 502);
    return json({ success: true });
  }

  return json({ error: 'Método no permitido' }, 405);
}