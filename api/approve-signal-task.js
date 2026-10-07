import { json, readJson, requireSignalOwner, rest } from '../lib/server/signal-auth.js';

export const config = { runtime: 'edge' };

function normalizeAssignee(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}_-]+/gu, '').toLowerCase();
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const { context, error } = await requireSignalOwner(req);
  if (error) return error;

  const body = await readJson(req);
  if (!body || typeof body.signal_id !== 'string' || typeof body.proposal_id !== 'string') {
    return json({ error: 'Señal y propuesta requeridas' }, 400);
  }

  const owner = `created_by=eq.${encodeURIComponent(context.profile.id)}`;
  const { response: signalResponse, data: signalRows } = await rest(
    context,
    `signals?${owner}&id=eq.${encodeURIComponent(body.signal_id)}&select=id,analysis&limit=1`
  );
  const signal = signalRows?.[0];
  if (!signalResponse.ok) return json({ error: 'No se pudo cargar la señal' }, 502);
  if (!signal) return json({ error: 'Señal no encontrada' }, 404);

  const analysis = signal.analysis && typeof signal.analysis === 'object' ? structuredClone(signal.analysis) : {};
  const proposal = Array.isArray(analysis.proposedTasks)
    ? analysis.proposedTasks.find(item => item.id === body.proposal_id)
    : null;
  if (!proposal) return json({ error: 'Propuesta de tarea no encontrada' }, 404);

  const { response: priorResponse, data: priorRows } = await rest(
    context,
    `tasks?signal_id=eq.${encodeURIComponent(signal.id)}&signal_proposal_id=eq.${encodeURIComponent(proposal.id)}&select=id,titulo&limit=1`
  );
  if (!priorResponse.ok) return json({ error: 'No se pudo verificar si la propuesta ya fue aprobada' }, 502);
  if (priorRows?.[0]) {
    proposal.status = 'approved';
    proposal.task_id = priorRows[0].id;
    const { response: repairedResponse } = await rest(
      context,
      `signals?${owner}&id=eq.${encodeURIComponent(signal.id)}`,
      { method: 'PATCH', body: { analysis }, prefer: 'return=minimal' }
    );
    if (!repairedResponse.ok) return json({ error: 'La tarea ya existe, pero no se pudo actualizar su propuesta' }, 502);
    return json({ success: true, task: priorRows[0], already_created: true });
  }
  if (proposal.status !== 'pending') return json({ error: 'La propuesta ya no está pendiente' }, 409);

  const title = String(body.title ?? proposal.title ?? '').trim().slice(0, 200);
  if (!title) return json({ error: 'La tarea debe tener título' }, 400);
  const ventureId = body.venture_id ?? proposal.venture_id ?? null;
  if (ventureId) {
    const { response, data } = await rest(context, `ventures?id=eq.${encodeURIComponent(ventureId)}&select=id&limit=1`);
    if (!response.ok || !data?.length) return json({ error: 'Venture inválido' }, 400);
  }
  const dueDate = body.due_date ?? proposal.due_date ?? null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return json({ error: 'Fecha límite inválida' }, 400);
  const priority = ['baja', 'media', 'alta', 'urgente'].includes(body.priority ?? proposal.priority)
    ? body.priority ?? proposal.priority
    : 'media';

  let finalTitle = title;
  const assigneeId = body.assignee_id ?? proposal.assignee_id ?? null;
  if (assigneeId) {
    const { response, data } = await rest(context, `users?id=eq.${encodeURIComponent(assigneeId)}&select=id,nombre&limit=1`);
    const assignee = data?.[0];
    if (!response.ok || !assignee) return json({ error: 'Responsable inválido' }, 400);
    const tag = normalizeAssignee(assignee.nombre);
    if (tag && !finalTitle.toLowerCase().includes(`@${tag}`)) finalTitle = `${finalTitle} @${tag}`;
  }

  proposal.title = title;
  proposal.venture_id = ventureId;
  proposal.due_date = dueDate;
  proposal.priority = priority;
  proposal.assignee_id = assigneeId;

  const task = {
    titulo: finalTitle,
    venture_id: ventureId,
    asignado_a: assigneeId,
    prioridad: priority,
    fecha_limite: dueDate,
    estado: 'pendiente',
    creado_por: context.profile.id,
    signal_id: signal.id,
    signal_proposal_id: proposal.id
  };
  const { response: insertResponse, data: insertedRows } = await rest(context, 'tasks?select=id,titulo', {
    method: 'POST', body: task, prefer: 'resolution=ignore-duplicates,return=representation'
  });
  if (!insertResponse.ok) return json({ error: 'No se pudo crear la tarea' }, 502);

  let createdTask = insertedRows?.[0];
  if (!createdTask) {
    const { data: existingRows } = await rest(
      context,
      `tasks?signal_id=eq.${encodeURIComponent(signal.id)}&signal_proposal_id=eq.${encodeURIComponent(proposal.id)}&select=id,titulo&limit=1`
    );
    createdTask = existingRows?.[0];
  }
  if (!createdTask) return json({ error: 'No se pudo confirmar la tarea creada' }, 502);

  proposal.status = 'approved';
  proposal.task_id = createdTask.id;
  const { response: updateResponse } = await rest(
    context,
    `signals?${owner}&id=eq.${encodeURIComponent(signal.id)}`,
    { method: 'PATCH', body: { analysis }, prefer: 'return=minimal' }
  );
  if (!updateResponse.ok) return json({ error: 'La tarea existe, pero no se pudo actualizar el estado de la propuesta' }, 502);
  return json({ success: true, task: createdTask });
}