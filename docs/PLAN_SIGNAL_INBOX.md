# Plan de implementación: Signal Inbox

**Fecha:** 1 de octubre de 2026  
**Base auditada:** SPA actual en `index.html`, funciones Vercel en `api/`, Supabase client-side y endpoints de OpenAI/Google Calendar.

## Hallazgo que condiciona la implementación

La inspección estática confirmó el uso de `users`, `ventures` y `tasks`. El usuario compartió resultados de Supabase: `users.id`/`auth_id`, `ventures.id`, y los IDs de `tasks`/`venture_id`/`project_id`/`asignado_a`/`creado_por` son UUID; `users.rol`, `users.nombre` y los campos de estado/prioridad son texto; `tasks.fecha_limite` es `date`; `tasks.creado_en` y `completado_en` son timestamps. La migración usa UUID compatible para Signal-Task. La tabla `tasks` dispone del campo real `asignado_a`; los flujos manuales y Signal ahora lo escriben además de conservar la @mención compatible con lectores antiguos. No se compartieron constraints/FKs ni defaults de `roles_permissions`.

Las políticas compartidas muestran `acceso_desarrollo_tasks`, `acceso_desarrollo_users`, `acceso_desarrollo_ventures` y `acceso_desarrollo_permissions` para `public`, `ALL`, `true`; también `tasks_select` para `authenticated`, `SELECT`, `true`. Los grants compartidos muestran todos los privilegios sobre `users`, `ventures`, `tasks` y `roles_permissions` para `anon` y `authenticated`. El usuario confirmó que aplicó revocaciones de `anon` para esas cuatro tablas. La consulta más amplia reveló grants `anon` en otras tablas; se preparó `202610060002_revoke_anon_internal_tables.sql` para tablas de uso interno que el SPA consulta con sesión o que usan endpoints privilegiados. Quedan excluidas `postulaciones` (posible ingreso público) y `venture_social_config` (tiene política explícita `anon_all`) hasta confirmar su propósito. Estas revocaciones no eliminan políticas ni cambian grants autenticados: no resuelven el acceso excesivo de cuentas autenticadas ni protegen endpoints `service_role`, incluidos los endpoints actuales de Calendar. La migración de Signals también revoca privilegios de `anon` y `public` sobre `signals`.

La consulta de estado confirma RLS activado en las 19 tablas y `force_rls=false` en todas. Los grants por sí solos no describen el acceso efectivo: con RLS activo, tablas sin política aplicable (`calendar_tokens`, `presence_requests`, `postulaciones`) deniegan acceso por PostgREST pese a sus grants; `cal_events` permite lectura pública por su política SELECT `true`; `activity_log`, `projects`, `venture_metrics`, `workflow_state` y `venture_social_config` tienen políticas abiertas que sí permiten acceso anónimo donde el grant aún existe. `venture_social_config` es especialmente relevante por su política explícita `anon_all`. `service_role` evita RLS y requiere autorización en cada endpoint.

Se puede preparar una migración aditiva a partir de los contratos observados en el código, pero **no debe aplicarse en producción hasta contrastarla con el esquema y las políticas reales**. La implementación de Signals será exclusiva para el rol `owner` inicialmente: el usuario autenticado se verifica en servidor y cada endpoint vuelve a resolver el perfil; no se confiará en IDs de usuario enviados por el navegador. La integración con manager/executor queda fuera hasta definir permisos RLS por venture.

## Decisiones de alcance

- Una Signal guarda el texto manual recibido, título, fuente/URL opcionales, estado y análisis JSON. No hay RSS, scraping ni consultas de noticias.
- Se reutilizan `ventures`, `tasks` y el sistema visual existente. Supabase confirma que `projects` existe, aunque el SPA no la consulta; hasta obtener sus columnas y relaciones, el análisis no inventa su forma ni crea proyectos.
- El análisis separa hechos, interpretaciones y posibilidades, y devuelve propuestas para tareas, proyecto, oportunidad, investigación, contenido, conocimiento, acciones de Jordan y delegación. No ejecuta estas propuestas.
- Solo la aprobación individual de una propuesta de tarea crea una fila en `tasks`. Las demás propuestas se conservan en el análisis como borradores, sin crear entidades inexistentes.
- `tasks.signal_id` y `tasks.signal_proposal_id` son columnas aditivas para mantener origen e impedir que un doble clic/reintento cree tareas repetidas. El insert seguirá usando los campos existentes (`titulo`, `venture_id`, `prioridad`, `fecha_limite`, `estado`, `creado_por`).

## Archivos

### Crear

- `supabase/migrations/<timestamp>_create_signals.sql`: tabla `signals`, índices, RLS y columnas opcionales de trazabilidad/idempotencia en `tasks`. La migración habilita RLS y limita Signals al owner, coherente con el alcance inicial. Revisar los tipos/constraints desplegados antes de aplicarla.
- `lib/server/signal-auth.js`: validar bearer token con Supabase Auth, resolver perfil mediante `users.auth_id`, exigir rol owner y obtener el cliente REST privilegiado solo después de autenticar. Se ubica fuera de `/api` para no desplegarlo como endpoint público.
- `lib/server/signal-analysis.js`: servicio independiente del proveedor que construye el contrato de análisis y valida/normaliza la salida estructurada de OpenAI.
- `api/signals.js`: listar, crear y obtener Signals; validar tamaños/entradas y derivar `created_by` del perfil autenticado.
- `api/analyze-signal.js`: analizar una Signal existente, guardar resultado y `analyzed_at`; autenticar y autorizar en cada petición.
- `api/approve-signal-task.js`: aprobar una propuesta identificada, validar sus datos y crear una Task una sola vez con referencia a Signal.
- `assets/js/signals.js`: estado, acceso HTTP con el token actual, lista/detalle, captura, análisis, edición de propuesta y aprobación individual.
- `assets/css/signals.css`: estilos pequeños compatibles con tokens y componentes existentes.

### Modificar

- `index.html`: incluir CSS/JS, añadir entrada de navegación visible al owner, página Signal Inbox y permitir esa página en el router owner. No extraer ni reescribir el SPA completo.
- `sw.js`: no cachear endpoints `/api/` ni respuestas autenticadas.

## Funciones y componentes

- `requireSignalOwner(request)`: verificar token, leer usuario autenticado, resolver `users.id`/`users.rol` y rechazar perfil ausente o no owner.
- `listSignals`, `createSignal`, `getSignal`: CRUD mínimo, acotado al perfil/rol; no aceptar `created_by` del cliente.
- `analyzeSignal(signal, ventures, tasks, projects)`: salida JSON con `summary`, `facts`, `interpretations`, relaciones con nivel de confianza, propuestas por tipo, acciones personales y delegación. Se pasan ventures/tareas existentes; integrar Projects requiere primero confirmar sus columnas y relaciones reales.
- `approveTaskProposal(signalId, proposalId, edits)`: insertar una Task compatible con el flujo actual, persistir `signal_id` y una clave de propuesta única, y devolver la existente si ya fue aprobada.
- La UI mantiene la separación entre texto fuente y análisis. Hecho, interpretación y oportunidad potencial se renderizan en bloques distintos. Tareas editables y aprobables de forma individual; nunca hay un botón de aceptación global que ejecute todo.

## Flujo de datos

1. El owner pega contenido y opcionalmente título, fuente y URL.
2. `assets/js/signals.js` envía la sesión bearer al endpoint; el backend valida usuario/rol y guarda Signal.
3. Al analizar, el endpoint carga la Signal y contexto autorizado de ventures/tasks, invoca el servicio de análisis y persiste JSON de propuestas.
4. La UI renderiza el análisis escapando contenido externo y permite editar/descartar propuestas.
5. Al aprobar una tarea, el endpoint vuelve a autenticar, valida que la propuesta pertenece a la Signal y hace un insert idempotente. Las otras clases de propuesta no crean registros en esta fase.

## Riesgos y mitigaciones

- **Esquema Supabase parcialmente verificado:** los tipos UUID de users/ventures/tasks y los defaults de `roles_permissions` coinciden con el código/migración; faltan constraints/FKs y defaults de tablas restantes. Revisar el SQL final en staging antes de migrar.
- **RLS y permisos históricos:** grants iniciales daban todos los privilegios de `users`, `ventures`, `tasks` y `roles_permissions` a `anon` y `authenticated`. El usuario confirmó que ejecutó las revocaciones `anon` en las cuatro tablas. Las políticas `public ALL true` siguen dejando acceso sin filtro efectivo para usuarios autenticados; por permitir modificar `users.rol` y asignaciones de venture, existe riesgo de autoelevar permisos. Los endpoints con `service_role` necesitan autorización propia. La UI ya trata cero filas como ningún venture y “todos” como filas explícitas con `puede_ver=true`; aún no aplica `puede_editar` ni `puede_administrar`. Definir esas capacidades antes de redactar RLS autenticado.
- **Prompt injection / contenido no confiable:** tratar la Signal como dato, limitar tamaño, pedir JSON estructurado, validar enums/IDs/fechas y no ejecutar herramientas ni acciones externas desde el modelo.
- **Duplicados/reintentos:** clave única `(signal_id, signal_proposal_id)` y aprobación transaccional/idempotente.
- **Inyección HTML:** escapar todos los campos provenientes de Signal/modelo; nunca insertar salida del modelo como HTML confiable.
- **Propuestas sin entidades destino:** oportunidades, research, content, knowledge y projects son informativas en Fase 1; no se simula su creación.
- **Dependencia de modelo:** aislar llamada y schema en `signal-analysis.js`; OpenAI no se considera fuente de actualidad ni de verdad.

## Compatibilidad

- No se reemplaza la SPA, login, ventures, inbox de notas, calendario ni Tasks.
- El alta de tareas conserva nombres/estados/campos usados por el flujo existente y añade únicamente metadatos opcionales.
- La función actual `/api/analyze` para notas permanece intacta; el nuevo servicio tiene ruta/contrato separado.
- La tabla `projects` existe en Supabase pero su esquema no está confirmado; el análisis no consulta columnas supuestas ni crea proyectos hasta verificarlas.
- Si la migración no se aplica, Signals no debe mostrarse como operativa; la UI debe comunicar el error de configuración sin fallback silencioso a `localStorage`.

## Verificación prevista

- `node --check` en los módulos y handlers nuevos; `git diff --check`.
- Pruebas de los helpers de autenticación/validación con token ausente, perfil no owner, esquema de análisis inválido, IDs/ventures desconocidos y doble aprobación.
- Prueba manual autenticada: guardar, listar, abrir, analizar, editar propuesta, descartar una y aprobar una tarea; verificar `signal_id` y no duplicación.
- Prueba de seguridad: petición anónima rechazada; usuario manager/executor rechazado; `created_by` no se puede suplantar; ninguna propuesta no-task produce mutaciones.
- No se podrá afirmar compilación contra Supabase real ni aplicación de migración hasta obtener acceso al esquema/entorno; esa limitación se informará al cerrar.