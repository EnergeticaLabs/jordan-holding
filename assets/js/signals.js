const state = { signals: [], selected: null, ventures: [], users: [], loading: false };
const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

async function api(path, options = {}) {
  const token = await window.getSignalAccessToken?.();
  if (!token) throw new Error('Tu sesión expiró. Vuelve a ingresar.');
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud');
  return data;
}

function setFeedback(message, kind = '') {
  const node = $('signal-form-status');
  if (!node) return;
  node.textContent = message;
  node.dataset.kind = kind;
}

function renderList() {
  const container = $('signals-list');
  if (!container) return;
  if (state.loading) {
    container.innerHTML = '<div class="signal-empty">Cargando señales...</div>';
    return;
  }
  if (!state.signals.length) {
    container.innerHTML = '<div class="signal-empty">Aún no hay señales guardadas.</div>';
    return;
  }
  container.innerHTML = state.signals.map(signal => `
    <button class="signal-list-item" type="button" data-signal-id="${escapeHtml(signal.id)}" aria-current="${state.selected?.id === signal.id}">
      <div class="signal-list-title">${escapeHtml(signal.title)}</div>
      <div class="signal-list-meta"><span>${escapeHtml(signal.source || 'Sin fuente')}</span><span>${escapeHtml(signal.status || 'inbox')}</span></div>
    </button>`).join('');
  container.querySelectorAll('[data-signal-id]').forEach(button => {
    button.addEventListener('click', () => selectSignal(button.dataset.signalId));
  });
}

function renderStringList(items) {
  if (!Array.isArray(items) || !items.length) return '<div class="signal-status">Sin propuestas.</div>';
  return `<ul class="signal-item-list">${items.map(item => `<li>${escapeHtml(typeof item === 'string' ? item : item.text || item.action || '')}</li>`).join('')}</ul>`;
}

function renderProposal(proposal, type) {
  const title = proposal.title || proposal.question || 'Propuesta';
  const assignee = state.users.find(user => String(user.id) === String(proposal.assignee_id));
  const details = [proposal.description, proposal.reason, proposal.angle, assignee && `Responsable sugerido: ${assignee.nombre}`, proposal.data_needed && `Datos necesarios: ${proposal.data_needed}`, proposal.possible_outcome && `Posible resultado: ${proposal.possible_outcome}`, proposal.delegate_to && `Delegar a: ${proposal.delegate_to}`].filter(Boolean).join('\n');
  const status = proposal.status || 'pending';
  const taskControls = type === 'proposedTasks' && status === 'pending' ? `
    <div class="signal-proposal-controls">
      <input class="form-input" data-proposal-title="${escapeHtml(proposal.id)}" value="${escapeHtml(proposal.title)}" aria-label="Editar título de tarea">
      <select class="form-input" data-proposal-venture="${escapeHtml(proposal.id)}" aria-label="Venture relacionada">
        <option value="">Sin venture</option>
        ${state.ventures.map(venture => `<option value="${escapeHtml(venture.id)}" ${String(venture.id) === String(proposal.venture_id) ? 'selected' : ''}>${escapeHtml(venture.nombre)}</option>`).join('')}
      </select>
      <input class="form-input" type="date" data-proposal-date="${escapeHtml(proposal.id)}" value="${escapeHtml(proposal.due_date || '')}" aria-label="Fecha límite">
      <select class="form-input" data-proposal-priority="${escapeHtml(proposal.id)}" aria-label="Prioridad">
        ${['baja', 'media', 'alta', 'urgente'].map(priority => `<option ${priority === (proposal.priority || 'media') ? 'selected' : ''}>${priority}</option>`).join('')}
      </select>
      <select class="form-input" data-proposal-assignee="${escapeHtml(proposal.id)}" aria-label="Responsable sugerido">
        <option value="">Sin responsable</option>
        ${state.users.map(user => `<option value="${escapeHtml(user.id)}" ${String(user.id) === String(proposal.assignee_id) ? 'selected' : ''}>${escapeHtml(user.nombre)}</option>`).join('')}
      </select>
    </div>` : status === 'pending' ? `<div class="signal-proposal-controls"><input class="form-input" data-proposal-title="${escapeHtml(proposal.id)}" value="${escapeHtml(title)}" aria-label="Editar propuesta">${type === 'proposedResearch' ? '' : '<span></span>'}</div>` : '';
  const actions = status === 'pending' ? (type === 'proposedTasks'
    ? `<button class="btn btn-primary-sm" data-approve-task="${escapeHtml(proposal.id)}">Aprobar y crear tarea</button><button class="task-action-btn" data-reject-proposal="${escapeHtml(proposal.id)}" data-proposal-type="${type}">Descartar</button>`
    : `<button class="btn btn-secondary" data-approve-proposal="${escapeHtml(proposal.id)}" data-proposal-type="${type}">Aprobar borrador</button><button class="task-action-btn" data-reject-proposal="${escapeHtml(proposal.id)}" data-proposal-type="${type}">Descartar</button>`)
    : `<span class="signal-status">${status === 'approved' ? (type === 'proposedTasks' ? 'Aprobada' : 'Aprobada como borrador; entidad aún no creada') : 'Descartada'}</span>`;
  return `<article class="signal-proposal">
    <div class="signal-proposal-title">${escapeHtml(title)}</div>
    ${details ? `<div class="signal-proposal-copy">${escapeHtml(details)}</div>` : ''}
    ${type === 'proposedContent' ? `<div class="signal-proposal-copy">${escapeHtml([proposal.format, proposal.audience].filter(Boolean).join(' · '))}</div>` : ''}
    ${taskControls}<div class="signal-proposal-actions">${actions}</div>
  </article>`;
}

function renderProposalGroup(title, type, items) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<section class="signal-analysis-block"><h3 class="signal-section-heading">${escapeHtml(title)}</h3>${items.map(item => renderProposal(item, type)).join('')}</section>`;
}

function renderDetail() {
  const container = $('signal-detail');
  if (!container) return;
  const signal = state.selected;
  if (!signal) {
    container.innerHTML = '<div class="panel signal-empty">Selecciona una señal para revisarla.</div>';
    return;
  }
  const analysis = signal.analysis;
  const sourceUrl = signal.source_url && /^https?:\/\//i.test(signal.source_url) ? `<a class="signal-source-link" href="${escapeHtml(signal.source_url)}" target="_blank" rel="noopener noreferrer">Abrir fuente ↗</a>` : '';
  let analysisHtml = '';
  if (analysis) {
    const ventures = (analysis.relatedVentures || []).map(item => {
      const venture = state.ventures.find(candidate => String(candidate.id) === String(item.id));
      return `<span class="signal-relation">${escapeHtml(venture?.nombre || 'Venture')} · posible (${escapeHtml(item.confidence || 'low')})</span>`;
    }).join('');
    analysisHtml = `<div class="signal-analysis">
      <section class="signal-analysis-block"><h3 class="signal-section-heading">Resumen</h3><p class="signal-summary">${escapeHtml(analysis.summary || '')}</p></section>
      <section class="signal-analysis-block"><h3 class="signal-section-heading">Hechos de la fuente</h3>${renderStringList(analysis.facts)}</section>
      <section class="signal-analysis-block"><h3 class="signal-section-heading">Interpretaciones</h3>${renderStringList(analysis.interpretations)}</section>
      ${ventures ? `<section class="signal-analysis-block"><h3 class="signal-section-heading">Ventures posibles</h3><div class="signal-relations">${ventures}</div></section>` : ''}
      <section class="signal-analysis-block"><h3 class="signal-section-heading">Proyectos existentes</h3>${(analysis.relatedProjects || []).length ? renderStringList(analysis.relatedProjects) : '<div class="signal-status">No hay proyectos existentes disponibles en el contexto del sistema.</div>'}</section>
      ${renderProposalGroup('Tareas propuestas', 'proposedTasks', analysis.proposedTasks)}
      ${renderProposalGroup('Proyecto potencial', 'proposedProjects', analysis.proposedProjects)}
      ${renderProposalGroup('Oportunidad potencial', 'proposedOpportunities', analysis.proposedOpportunities)}
      ${renderProposalGroup('Pregunta de investigación', 'proposedResearch', analysis.proposedResearch)}
      ${renderProposalGroup('Contenido posible', 'proposedContent', analysis.proposedContent)}
      ${renderProposalGroup('Conocimiento a incorporar', 'knowledgeSuggestions', analysis.knowledgeSuggestions)}
      ${analysis.recommendedHumanActions?.length ? `<section class="signal-analysis-block"><h3 class="signal-section-heading">Decisiones o acciones de Jordan</h3>${renderStringList(analysis.recommendedHumanActions)}</section>` : ''}
      ${analysis.delegationSuggestions?.length ? `<section class="signal-analysis-block"><h3 class="signal-section-heading">Posible delegación</h3>${renderStringList(analysis.delegationSuggestions.map(item => `${item.action}${item.delegate_to ? ` · ${item.delegate_to}` : ''}${item.reason ? `: ${item.reason}` : ''}`))}</section>` : ''}
    </div>`;
  }
  container.innerHTML = `<article class="panel signal-detail-card">
    <header class="signal-detail-header"><div><h2 class="signal-detail-title">${escapeHtml(signal.title)}</h2><div class="signal-detail-meta">${escapeHtml(signal.source || 'Sin fuente')} · ${escapeHtml(new Date(signal.created_at).toLocaleString('es-PE'))} · ${escapeHtml(signal.status)}</div>${sourceUrl}</div>
    <div class="signal-detail-actions"><button class="btn btn-secondary" type="button" data-analyze-signal>${analysis ? 'Analizar de nuevo' : 'Analizar'}</button><button class="task-action-btn" type="button" data-archive-signal>Archivar</button></div></header>
    <div class="signal-original">${escapeHtml(signal.content)}</div>${analysisHtml}
  </article>`;
  container.querySelector('[data-analyze-signal]')?.addEventListener('click', analyzeSelected);
  container.querySelector('[data-archive-signal]')?.addEventListener('click', archiveSelected);
  container.querySelectorAll('[data-approve-task]').forEach(button => button.addEventListener('click', () => approveTask(button.dataset.approveTask)));
  container.querySelectorAll('[data-approve-proposal]').forEach(button => button.addEventListener('click', () => approveProposal(button.dataset.proposalType, button.dataset.approveProposal)));
  container.querySelectorAll('[data-reject-proposal]').forEach(button => button.addEventListener('click', () => rejectProposal(button.dataset.proposalType, button.dataset.rejectProposal)));
}

async function loadSignals() {
  state.loading = true;
  renderList();
  try {
    state.signals = await api('/api/signals');
    const currentId = state.selected?.id;
    state.selected = state.signals.find(signal => signal.id === currentId) || state.signals[0] || null;
    if (state.selected) state.selected = await api(`/api/signals?id=${encodeURIComponent(state.selected.id)}`);
  } catch (error) {
    state.signals = [];
    state.selected = null;
    const list = $('signals-list');
    if (list) list.innerHTML = `<div class="signal-empty">${escapeHtml(error.message)}</div>`;
  } finally {
    state.loading = false;
    renderList();
    renderDetail();
  }
}

async function selectSignal(id) {
  try {
    state.selected = await api(`/api/signals?id=${encodeURIComponent(id)}`);
    renderList();
    renderDetail();
  } catch (error) {
    setFeedback(error.message, 'error');
  }
}

async function saveSignal(analyzeAfterSave) {
  const content = $('signal-content').value.trim();
  if (!content) return setFeedback('Pega el contenido de la señal.', 'error');
  const buttons = document.querySelectorAll('#signal-form button');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const signal = await api('/api/signals', {
      method: 'POST',
      body: JSON.stringify({ title: $('signal-title').value, source: $('signal-source').value, source_url: $('signal-url').value, content })
    });
    $('signal-form').reset();
    setFeedback('Señal guardada.', 'success');
    await loadSignals();
    await selectSignal(signal.id);
    if (analyzeAfterSave) await analyzeSelected();
  } catch (error) {
    setFeedback(error.message, 'error');
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

async function analyzeSelected() {
  if (!state.selected) return;
  const container = $('signal-detail');
  const button = container.querySelector('[data-analyze-signal]');
  if (button) { button.disabled = true; button.textContent = 'Analizando...'; }
  try {
    const result = await api('/api/analyze-signal', { method: 'POST', body: JSON.stringify({ signal_id: state.selected.id }) });
    state.selected = { ...state.selected, analysis: result.analysis, status: 'analyzed', analyzed_at: new Date().toISOString() };
    state.signals = state.signals.map(signal => signal.id === state.selected.id ? state.selected : signal);
    renderList();
    renderDetail();
  } catch (error) {
    setFeedback(error.message, 'error');
    if (button) { button.disabled = false; button.textContent = 'Reintentar análisis'; }
  }
}

async function approveTask(proposalId) {
  if (!state.selected) return;
  const title = document.querySelector(`[data-proposal-title="${CSS.escape(proposalId)}"]`)?.value.trim();
  const ventureId = document.querySelector(`[data-proposal-venture="${CSS.escape(proposalId)}"]`)?.value || null;
  const dueDate = document.querySelector(`[data-proposal-date="${CSS.escape(proposalId)}"]`)?.value || null;
  const priority = document.querySelector(`[data-proposal-priority="${CSS.escape(proposalId)}"]`)?.value || 'media';
  const assigneeId = document.querySelector(`[data-proposal-assignee="${CSS.escape(proposalId)}"]`)?.value || null;
  try {
    await api('/api/approve-signal-task', {
      method: 'POST',
      body: JSON.stringify({ signal_id: state.selected.id, proposal_id: proposalId, title, venture_id: ventureId, due_date: dueDate, priority, assignee_id: assigneeId })
    });
    await selectSignal(state.selected.id);
    setFeedback('Task creada y vinculada a la señal.', 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
}

async function rejectProposal(type, proposalId) {
  if (!state.selected) return;
  try {
    await api(`/api/signals?id=${encodeURIComponent(state.selected.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'set-proposal-status', proposalType: type, proposalId, status: 'rejected' })
    });
    await selectSignal(state.selected.id);
  } catch (error) {
    setFeedback(error.message, 'error');
  }
}

async function approveProposal(type, proposalId) {
  if (!state.selected) return;
  const title = document.querySelector(`[data-proposal-title="${CSS.escape(proposalId)}"]`)?.value.trim();
  const field = type === 'proposedResearch' ? 'question' : 'title';
  if (!title) return setFeedback('La propuesta necesita un título o pregunta.', 'error');
  try {
    await api(`/api/signals?id=${encodeURIComponent(state.selected.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'set-proposal-status', proposalType: type, proposalId, status: 'approved', edits: { [field]: title } })
    });
    await selectSignal(state.selected.id);
  } catch (error) {
    setFeedback(error.message, 'error');
  }
}

async function archiveSelected() {
  if (!state.selected) return;
  try {
    await api(`/api/signals?id=${encodeURIComponent(state.selected.id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'archive' }) });
    await loadSignals();
  } catch (error) {
    setFeedback(error.message, 'error');
  }
}

function load() {
  if (state.loading) return;
  const context = window.getSignalContext?.() || {};
  state.ventures = context.ventures || [];
  state.users = context.users || [];
  loadSignals();
}

window.saveSignal = saveSignal;
window.loadSignals = loadSignals;
window.SignalInbox = {
  load,
  async openSignal(id) {
    window.setPage?.('signals');
    await selectSignal(id);
  }
};