# Informe técnico: evolución incremental de Virtual Flow Holding

**Fecha de auditoría:** 1 de octubre de 2026  
**Repositorio:** `EnergeticaLabs/jordan-holding`, rama `main`  
**Alcance:** revisión estática de archivos disponibles en el repositorio. No se modificó la aplicación ni la base de datos.

## Alcance y límites de verificación

Este repositorio no contiene migraciones SQL, definiciones de tablas, políticas RLS, configuración local de Supabase ni pruebas automatizadas. Por ello, las tablas que se enumeran abajo son las que el código intenta consultar; inicialmente no se pudo verificar el esquema remoto. Después, el usuario compartió resultados de Supabase que confirman algunos tipos de `users` y `tasks`, además de grants y políticas de Tasks. No se consultó directamente el dashboard de Supabase ni Vercel.

La documentación existente no es una fuente fiable del estado actual: [README.md](../README.md) solo contiene el título; [CONTEXT.md](../CONTEXT.md) se fecha en mayo de 2025 y enumera siete tablas y ocho ventures; un inventario previo del repositorio también difiere de las consultas que hoy hace el código. La fuente de evidencia para este informe es principalmente [index.html](../index.html) y los handlers de [api](../api/).

## Resumen ejecutivo

El Holding ya es más que un tablero básico de tareas: es una SPA operativa con autenticación Supabase, ventures, tareas, equipo, notas/inbox, horarios, ausencias, eventos y una integración parcial con Google Calendar. Mantiene `venture` como concepto central y carga ventures desde Supabase, por lo que no hace falta introducir entidades paralelas para empresas, instituciones o clientes.

La arquitectura, sin embargo, todavía es mayormente monolítica: interfaz, estado, lógica de negocio y acceso a datos están concentrados en un `index.html` grande; las funciones de Vercel cubren Google Calendar y una extracción de tareas mediante OpenAI. No hay módulos implementados para signals, opportunities, content, research, knowledge ni agents.

El principal impedimento para ampliar el sistema con seguridad no es de interfaz: los endpoints que usan `SUPABASE_SERVICE_ROLE_KEY` no validan una sesión ni autorizan el usuario/venture solicitado. Además, el OAuth de Google usa el ID del perfil como `state`, sin nonce aleatorio de un solo uso ni asociación verificable con la sesión. Se recomienda cerrar estas brechas antes de permitir ingestión externa o nuevas acciones con privilegios.

## 1. ¿Cómo está construido actualmente el Holding?

- **Frontend:** SPA sin framework en [index.html](../index.html), con HTML, CSS y JavaScript embebidos. La carpeta `assets/js/` solo tiene `.gitkeep`; no hay módulos de frontend separados. Usa el cliente Supabase cargado en el navegador.
- **Estado y flujos:** variables globales en el documento mantienen sesión, rol, ventures, tareas, notas y calendario. La aplicación consulta y modifica datos desde el navegador; la UI cambia por rol, pero eso no sustituye autorización en servidor o RLS.
- **Backend:** funciones serverless de Vercel bajo [api](../api/), configuradas con runtime Edge. Hay un endpoint de análisis y endpoints de Google Calendar/OAuth. No hay una capa de servicios de dominio compartida identificable.
- **Despliegue:** [vercel.json](../vercel.json) sirve el sitio estático y enruta `/api/*`; [sw.js](../sw.js) implementa caché de la app shell y de respuestas GET.
- **Stack:** Supabase Auth/PostgREST para identidad y datos; Google Calendar OAuth; OpenAI para sugerir tareas a partir de notas. No se encontró integración real de Claude o n8n en el código revisado.

## 2. ¿Qué tablas existen realmente?

No se puede verificar el esquema real desde este repositorio. Estas son las tablas referenciadas por llamadas visibles del cliente o API:

- **Operación principal:** `users`, `ventures`, `venture_metrics`, `tasks`, `activity_log`, `roles_permissions`.
- **Notas e inbox:** `inbox_notes`. El código también contiene una escritura a `tareas`, mientras que el flujo principal consulta y modifica `tasks`; hay que confirmar si es un nombre legado o un error antes de tocar ese flujo.
- **Calendario y equipo:** `calendar_tokens`, `cal_events`, `presence_requests`, `work_schedule_blocks`, `absences`, `executor_goals`.
- **Configuración de ventures:** `venture_social_config`, `venture_pub_schedule`.

No se detectaron consultas a la tabla `projects` en el SPA actual. Sin embargo, el resultado de grants de Supabase confirma que la tabla existe; sus columnas, relaciones y RLS aún no se han compartido. No hay evidencia de tablas `signals`, `opportunities`, `research`, `knowledge`, `content`, `agents` o `relationships`. Validar columnas, constraints y RLS en Supabase es un prerrequisito para integrar Projects con Signal Inbox.

## 3. ¿Qué funciones existen?

- Inicio/cierre de sesión con Supabase Auth y carga de perfil desde `users`.
- Lectura de ventures y métricas asociadas; consulta y gestión de tareas, responsables, prioridades y estados.
- Dashboard, vistas de ventures, gestión de equipo, filtros de tareas y feed de actividad.
- Inbox/notas con parser local de sintaxis para tareas, menciones, ventures, prioridades y fechas; sincronización en `inbox_notes` y posible vínculo con tareas.
- Horarios de trabajo, objetivos mensuales, ausencias y solicitudes de presencia.
- Eventos propios y consulta/sincronización parcial con Google Calendar: conexión, disponibilidad, lectura, creación, edición y borrado.
- Análisis de notas con OpenAI para **proponer** tareas. El usuario confirma individualmente antes de insertarlas en `tasks`, lo que ya ofrece un patrón básico de human-in-the-loop.
- Gestión de miembros y roles desde el cliente, con permisos por venture representados en `roles_permissions`.

La implementación de proyectos, versiones de contenido, investigación, oportunidades y agentes no está presente. Algunas configuraciones de redes sociales y calendario editorial son configuración, no un motor de contenido.

## 4. ¿Qué puede reutilizarse?

- Mantener `ventures` y sus IDs como contexto común; no crear tipos de entidad alternativos para clientes, universidades o marcas.
- Reutilizar `tasks` como mecanismo de ejecución y los estados/UX existentes, sin reemplazarlos por un gestor nuevo.
- Reutilizar Supabase Auth y `users.auth_id` para identidad, una vez que el servidor aplique autorización real.
- Reutilizar `roles_permissions` como dato de alcance por venture solo después de definir y probar políticas server-side/RLS. La comprobación actual en JavaScript es filtrado de presentación.
- Reutilizar el flujo de sugerencias de `/api/analyze` como precedente para análisis asistido y aprobación humana, pero no exponerlo como endpoint público sin autenticar.
- Reutilizar el patrón de funciones Vercel para adaptadores de fuentes acotados. Evitar añadir un framework o migrar todo el SPA como parte de Fase 1.
- Usar `activity_log` para auditoría de acciones humanas, verificando primero su esquema y políticas; no sustituye un historial de estados de Signal si se necesita trazabilidad de dominio.

## 5. ¿Qué falta para Signals / Intelligence?

No hay bandeja de noticias, entidad persistente Signal, ciclo de revisión, deduplicación, fuentes configurables ni proceso de ingesta. La API de OpenAI actual recibe notas de usuario para extraer tareas; no busca noticias ni ofrece un pipeline de fuentes.

La Fase 1 necesita una entidad persistente que conserve título, fuente, URL, fechas, resumen, clasificación, importancia, estado y venture opcional. La ingesta debe separar proveedor, fetch, parseo, normalización y análisis. Para un primer corte basta con captura manual de una URL y un adaptador RSS explícitamente permitido; no aceptar URLs arbitrarias para fetch server-side, por riesgo de SSRF. El contenido fuente completo se almacenará solo cuando los términos/licencia lo permitan; como base conservar metadatos, URL y resumen/extracto permitido.

El primer flujo debe terminar en revisión humana: analizar, asociar venture, descartar/archivar y, una vez aprobada la relación con tareas, proponer ejecución. No publicar ni crear compromisos externos automáticamente.

## 6. ¿Qué falta para Content?

Hay configuración de redes y calendario editorial por venture, pero no existe una entidad que represente un átomo de conocimiento ni borradores/versiones/salidas por canal. Tampoco existe trazabilidad de contenido hacia signal, investigación, oportunidad, clase o proyecto. El módulo de contenido debe esperar a que Signal y las relaciones básicas estén estabilizados; no convertir `venture_social_config` en un modelo de contenido.

## 7. ¿Qué falta para Research?

No se encontraron entidades ni flujos de preguntas, hipótesis, fuentes, métodos, datos, experimentos, resultados o publicaciones. Para incorporarlo hacen falta decisiones de dominio y relaciones con ventures/signals; no conviene crear una tabla genérica antes de precisar esos flujos. En una fase posterior, Research y Knowledge deben poder originar tareas y alimentar contenido sin duplicar el contenido original de la fuente.

## 8. ¿Qué falta para Opportunities?

No hay objeto, pipeline ni estados de oportunidad. Las tareas pueden ejecutar trabajo, pero no representan calificación, decisión de perseguir, resultado ganado/perdido ni origen en señal, relación o investigación. No agregar una entidad hasta definir el flujo de decisión y los enlaces mínimos; no incorporar ranking automático.

## 9. ¿Qué falta para Agents?

No hay orquestador ni ejecución de agentes. `/api/analyze` es una llamada puntual a OpenAI que devuelve sugerencias; no mantiene runs, herramientas, identidad del agente, permisos, aprobaciones ni auditoría. Es el patrón reutilizable para una futura capacidad supervisada, no una arquitectura de agentes ya existente. El primer agente debería limitarse a proponer acciones y registrar propuestas; ejecutar acciones externas debe permanecer detrás de aprobación humana.

## 10. ¿Qué problemas de seguridad deben resolverse?

**Prioridad crítica antes de ampliar backend o automatizar:**

- [api/auth/google/callback.js](../api/auth/google/callback.js) trata `state` como `user_id` y guarda tokens para ese ID con la service role. [index.html](../index.html) envía `currentProfileId` directamente como state. No hay estado aleatorio, de un solo uso, validado contra sesión; hay riesgo de CSRF/vinculación de tokens a un perfil elegido por un atacante.
- Los handlers [api/calendar/status.js](../api/calendar/status.js), [api/calendar/events.js](../api/calendar/events.js), [api/calendar/availability.js](../api/calendar/availability.js), [api/calendar/create-event.js](../api/calendar/create-event.js) y [api/calendar/sync-event.js](../api/calendar/sync-event.js) usan service role y aceptan `user_id`, `owner_id` o `userId` del query/body sin validar JWT/sesión ni comprobar propiedad/rol/venture. Esto puede exponer estado/eventos o permitir crear, actualizar o borrar eventos de otra cuenta si se conoce un ID. `create-event` también puede actualizar una solicitud de presencia arbitraria mediante `request_id`.
- [api/analyze.js](../api/analyze.js) no autentica ni limita tamaño/uso del cuerpo antes de llamar a OpenAI. Expone consumo del proveedor y acepta contexto e IDs enviados por el cliente; las salidas deben seguir tratándose como datos no confiables. La pantalla sí pide confirmación antes de crear una tarea, lo cual debe conservarse.
- `currentUserRole` inicia con `owner`, y `loadUserProfile()` usa `owner` como fallback si no obtiene perfil. La visibilidad de pantallas y guards JavaScript no son controles de acceso. Un perfil ausente o mal configurado no debe adquirir privilegios por defecto.
- La service role no aparece en el código inspeccionado, lo cual es correcto; sin embargo, su uso en endpoints sin autenticación sigue siendo crítico. El anon key visible en una SPA es público por diseño y solo es seguro con políticas RLS restrictivas.
- Supabase reporta RLS activo (`relrowsecurity=true`) y `FORCE RLS` desactivado en todas las tablas listadas. El usuario confirmó grants `anon` revocados en `users`, `ventures`, `tasks` y `roles_permissions`. La exposición efectiva depende de grants y políticas combinados: `activity_log`, `projects`, `venture_metrics` y `workflow_state` conservan grants anon junto a políticas `public ALL true`; `cal_events` tiene grant anon y `public SELECT true`, por lo que permite lectura anónima; `venture_social_config` tiene grant y política `anon ALL true`. Tablas sin política aplicable como `calendar_tokens`, `presence_requests` y `postulaciones` son denegadas por PostgREST con RLS activo, pese a grants. Se preparó `202610060002_revoke_anon_internal_tables.sql` como defensa adicional para tablas internas; excluye `postulaciones` y `venture_social_config` hasta confirmar su uso esperado. Grants y RLS no protegen endpoints que usan `service_role`, pues ese rol evita RLS: requieren autenticación/autorización propia. Las políticas `public ALL true` siguen exponiendo todas las filas a usuarios autenticados donde conservan grants.
- [sw.js](../sw.js) excluye Supabase pero no `/api/*`; su handler puede guardar respuestas GET de API en Cache Storage, incluidos datos de calendario. Excluir rutas autenticadas/API de caché y usar `no-store` no basta mientras el service worker llame explícitamente a `cache.put`.
- Revisar CORS, rate limiting, validación de payloads, manejo de errores y logs sin secretos en todos los handlers como parte del endurecimiento. Las mutaciones de calendario y futuras publicaciones deben requerir autorización explícita y auditoría.

## 11. ¿Qué cambios son frontend?

- Incorporar una entrada “Intelligence” y vista de Signals en la SPA, reutilizando navegación, ventures, estilo y roles existentes.
- Mostrar lista/detalle con título, fuente, fecha, resumen, clasificación, venture, estado y acciones supervisadas; formularios para captura manual, asociación, archivo y revisión.
- Presentar análisis como sugerencia y exigir confirmación antes de crear tareas o cualquier objeto futuro.
- No hacer una refactorización masiva de `index.html` en esta fase. Extraer solo una pieza pequeña si el flujo nuevo lo justifica y la transición puede probarse sin romper la SPA.

## 12. ¿Qué cambios son backend?

- Añadir endpoints acotados para crear/listar/actualizar Signals, con validación de sesión/alcance y límites de entrada.
- Añadir un adaptador de fuente (RSS allowlisted inicialmente), parser y normalizador independientes del proveedor. No mezclar fetch de noticias con análisis OpenAI.
- Proteger `/api/analyze` y handlers de calendario con identidad Supabase verificada, autorización de objeto y rol; emitir respuestas genéricas sin detalles internos del proveedor.
- Incorporar deduplicación, manejo de fallos y límites de frecuencia en ingesta. OpenAI analiza Signals ya guardadas; no es fuente de actualidad ni fuente de verdad.

## 13. ¿Qué cambios requieren Supabase?

- El esquema compartido confirma UUID para `users.id`, `users.auth_id`, `ventures.id`, `tasks.id`, `tasks.venture_id`, `tasks.project_id`, `tasks.asignado_a` y `tasks.creado_por`; confirma `tasks.fecha_limite` como `date`. El alta manual y Signal guardan ahora el responsable en `tasks.asignado_a` y mantienen la @mención por compatibilidad. `roles_permissions` tiene flags con defaults `puede_ver=true`, `puede_editar=false` y `puede_administrar=false`. La UI ahora interpreta cero filas como ningún venture y “todos” como una fila explícita por venture; también filtra por `puede_ver=true`. Todavía no utiliza las otras dos flags. Faltan constraints/FKs de esa tabla.
- Para Fase 1, agregar solo `signals`, con FK opcional a `ventures` si el esquema real lo permite, índices útiles y políticas RLS basadas en el usuario autenticado y alcance por venture.
- Derivar `created_by` del usuario autenticado, no confiar en un ID arbitrario enviado por el navegador.
- Añadir campos/FK a `tasks` o una tabla de relaciones únicamente cuando se implemente y pruebe la acción de crear tareas desde una señal. No crear de antemano `opportunities`, `research`, `knowledge`, `content`, `agents` ni `relationships` sin flujos definidos.
- Guardar cada cambio de esquema en una migración versionada; hoy no hay convención ni directorio de migraciones en el repo.

## 14. ¿Qué cambios pueden hacerse sin modificar la base de datos?

- Corregir el flujo OAuth state, proteger endpoints, aplicar validación de entradas y excluir `/api/*` del service worker son cambios de código/configuración.
- Prototipar visualmente Intelligence con datos simulados es posible, pero no constituye un módulo funcional ni debe confundirse con Signals persistentes.
- Un análisis temporal de noticias en memoria no proporciona revisión, deduplicación ni trazabilidad; no se recomienda como sustituto de una tabla persistente.
- Las relaciones nuevas durables, estados de revisión compartidos e historial requieren esquema/RLS, salvo que se limite el prototipo a un usuario y almacenamiento local, que no es una base adecuada para el sistema descrito.

## 15. ¿Cuál es la mínima implementación viable de Fase 1?

1. **Puerta de seguridad:** corregir OAuth state con nonce criptográfico, expiración y uso único ligado a sesión; autenticar y autorizar cada endpoint que usa service role; revisar políticas RLS y evitar el rol `owner` como fallback. Excluir API del caché del service worker.
2. **Esquema mínimo:** una tabla `signals`, documentada en migración, con `id`, `title`, `summary`, `source`, `source_url`, `published_at`, `detected_at`, `category`, `importance`, `status`, `venture_id` opcional, `created_by` y `created_at`. Definir estados operativos de revisión y reglas de acceso antes de migrar. No copiar texto protegido por defecto.
3. **Ingesta estrecha:** captura manual por URL y un adaptador RSS para una fuente oficial acordada, con lista permitida fija, parseo/normalización, deduplicación y errores visibles. Mantener interfaz `Source -> Fetcher -> Parser -> Normalizer -> Signal`; no crear un framework de conectores ni un agente todavía.
4. **UI de revisión:** listado Intelligence con búsqueda/filtros básicos, detalle, venture opcional y acciones de analizar, archivar/descartar y revisar. Reutilizar el endpoint de IA solo después de protegerlo; mostrar resultados como sugerencias y preservar título, fuente y URL originales.
5. **Límite de alcance:** no implementar todavía oportunidades, research, content engine, agentes ni publicación. La relación `Signal -> Task` se incorpora en la fase de relaciones con una FK o vínculo explícito, no mediante texto improvisado en el título de la tarea.
6. **Pruebas de aceptación:** migración aplicada en un entorno no productivo; RLS probado con owner, manager y executor; una fuente RSS produce Signals deduplicadas; el usuario puede revisar y archivar; usuario no autenticado no puede leer/modificar datos; análisis no crea ni publica nada sin aprobación.

### Archivos concretos propuestos

**Para el primer incremento de Fase 1 (tras validar esquema y cerrar las brechas críticas):**

- `index.html`: navegación y vista Signals; captura, revisión y acciones manuales.
- `api/signals.js`: lectura/escritura autorizada y validación de Signals, si las operaciones no se resuelven directamente y con seguridad mediante RLS desde el cliente.
- `api/intelligence/ingest.js`: invocación protegida de ingesta para una fuente permitida.
- `lib/intelligence/sources/rss.js`: fetch/parse específico RSS separado de la API.
- `lib/intelligence/normalize-signal.js`: normalización común y deduplicación.
- `api/analyze.js`: autenticación, validación y adaptación para analizar una Signal guardada, conservando la salida como propuesta.
- `supabase/migrations/<timestamp>_create_signals.sql`: tabla, constraints, índices y RLS; crear solo después de comparar con el esquema desplegado.
- `sw.js`: bypass de rutas `/api/*` para no cachear respuestas autenticadas.

Estos son destinos propuestos, no archivos ya existentes. Si se elige acceso directo del cliente protegido por RLS para CRUD de Signals, `api/signals.js` puede omitirse; la ingesta externa debe seguir aislada y autenticada. Antes de implementar, confirmar el esquema Supabase real, las políticas actuales y cuál fuente RSS oficial se habilitará primero.

## Recomendación de secuencia

1. Verificar esquema y RLS reales en Supabase; corregir autorización backend y OAuth antes de ampliar privilegios.
2. Versionar migraciones y añadir Signals con políticas probadas.
3. Entregar captura/revisión manual en el panel; después habilitar una fuente RSS fija.
4. Añadir vínculos Signal-task explícitos y luego evaluar Opportunities, Research y Content según decisiones que el módulo ya permita tomar.
5. Incorporar un Holding Agent solo cuando permisos, relaciones y registro de propuestas estén definidos.

La dirección mantiene el concepto existente de venture y las tareas actuales, y evita convertir el Holding en un repositorio genérico de notas o desplegar entidades sin un flujo que las justifique.