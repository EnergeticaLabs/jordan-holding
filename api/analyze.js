export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `Eres un asistente personal de productividad. 
El usuario escribe notas libres sobre un emprendimiento y tú extraes tareas accionables.

Reglas:
- Solo extrae tareas concretas y accionables, no ideas vagas.
- Para cada tarea, detecta: título breve, venture relacionado (si aplica), responsable (si aplica), fecha límite (si aplica).
- El título debe ser corto y claro (máx. 60 caracteres), en primera persona o imperativo.
- Para venture_id y assignee_id usa solo IDs del contexto provisto. Si no hay match claro, usa null.
- Para fecha_limite usa formato YYYY-MM-DD. Si dice "viernes", "la próxima semana", etc., calcula desde la fecha actual del contexto.
- Si no hay tareas claras, devuelve array vacío.
- Responde SOLO con JSON válido, sin explicaciones, sin markdown.

Formato de respuesta:
{"sugerencias":[{"titulo":"...","venture_id":null,"assignee_id":null,"fecha_limite":null,"razon":"..."}]}`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key no configurada' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Cuerpo inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { notes, ventures = [], users = [], date = new Date().toISOString().split('T')[0] } = body;

  if (!notes || !notes.trim()) {
    return new Response(JSON.stringify({ sugerencias: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const contextBlock = [
    `Fecha actual: ${date}`,
    ventures.length ? `Ventures disponibles:\n${ventures.map(v => `- id=${v.id} nombre="${v.nombre}"`).join('\n')}` : '',
    users.length ? `Usuarios disponibles:\n${users.map(u => `- id=${u.id} nombre="${u.nombre}"`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const userMessage = `${contextBlock}\n\nNotas del venture:\n${notes}`;

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    return new Response(JSON.stringify({ error: `OpenAI error: ${openaiRes.status}`, detail: errText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const openaiData = await openaiRes.json();
  const raw = openaiData.choices?.[0]?.message?.content || '{"sugerencias":[]}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { sugerencias: [] };
  }

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
