# jordan-holding

Sistema operativo personal para Virtual Flow Holding (SPA en `index.html` + Supabase).

## Objetivo del sistema

Usar el panel como un Rukovoditel personalizado y ligero:

- Captura rapida de trabajo real (Inbox libre).
- Conversión de notas en pendientes accionables.
- Vinculacion a ventures por etiqueta (`#entidad`).
- Delegacion por etiqueta (`@persona`).
- Seguimiento diario por prioridad y cumplimiento.

## Flujo recomendado (diario)

1. Abre la app y entra a `Notas` (vista inicial).
2. Escribe en `Inbox libre` en formato natural, por ejemplo:
	- `[] llamar proveedor #vatio @hermano !alta hoy`
3. Marca la casilla de la linea para enviarla a `Pendientes de hoy`.
4. Ejecuta y completa desde `Pendientes de hoy`.
5. Si desmarcas/completas segun el flujo, la nota se sincroniza de vuelta con Inbox.

## Significado de etiquetas

- `#entidad`: vincula la nota con una venture (`tasks.venture_id` cuando hay match).
- `@persona`: deja trazabilidad de delegacion en el texto de la tarea.
- `!alta|!media|!baja|!urgente`: prioridad.
- `hoy`, `manana`, dias de semana: fecha sugerida.

## Accion real al usar #entidad

Cuando conviertes una linea del Inbox en pendiente:

- Se crea/actualiza la tarea en `tasks` con `venture_id` si la entidad coincide.
- Se registra actividad operativa en `activity_log` mencionando la venture detectada.

Esto convierte `#vatio` en algo operativo (no solo visual).

## Estructura tipo Rukovoditel (adaptada)

- Captura: `Notas > Inbox libre`
- Bandeja operativa diaria: `Notas > Pendientes de hoy`
- Ejecucion general: `Tareas`
- Seguimiento de negocio: `Ventures`
- Traza de decisiones: `Actividad reciente`

## Regla simple de trabajo

- Todo empieza en Inbox.
- Todo lo importante debe pasar por checkbox a Pendientes.
- Toda nota estrategica debe llevar `#entidad`.
- Toda nota delegada debe llevar `@persona`.

Con eso mantienes control operativo sin friccion y con trazabilidad por venture.