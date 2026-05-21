# CONTEXT.md — Virtual Flow Holding
> Archivo de contexto para continuidad del desarrollo. Actualizar en cada sesión.

---

## 👤 Fundador
- **Nombre:** Jordan Blancas
- **Perfil:** Ingeniero mecánico electricista, docente e investigador universitario
- **Ubicación:** Huancayo / Jauja, Perú
- **Objetivo principal:** Que los activos del holding generen ingresos autónomos (actualmente solo docencia genera ingresos)

---

## 🏢 El Holding: Virtual Flow Holding

### Ventures

| # | Nombre | Entidad Legal | Categoría | Estado |
|---|--------|--------------|-----------|--------|
| 1 | Fitbase | Fitbase Club S.A.C. | SaaS · Gimnasios | Building |
| 2 | Vatio | Vatio S.A.C. | Ingeniería Eléctrica | Activo |
| 3 | Élite Cultural | Élite Cultural Perú | Producción Audiovisual | Building |
| 4 | Polímatas Club | Virtual Flow Technologies LLC | EdTech · Comunidad | Building |
| 5 | Energética Labs | Proyecto Editorial | Blog · Energía | Activo |
| 6 | Ciencia Poética | Proyecto Educativo | Educación STEM | Building |
| 7 | iWatt Club | Virtual Power Plant | CleanTech · VPP · Blockchain | Planeado |
| 8 | Marca Personal | Jordan Blancas | Personal Brand | Building |

### Notas por venture
- **Fitbase:** 25 socios activos · objetivo vender a más gimnasios
- **Vatio:** Sin actividad comercial este año · quiere delegar lo comercial
- **Élite Cultural:** Filmaciones folclóricas · podcast "Cultura Popular" · espacio físico "Territorio Cultural"
- **Polímatas Club:** Sin miembros pagando aún
- **Energética Labs:** Monetización vía publicidad institucional
- **Ciencia Poética:** Sin cursos aún · modalidad virtual y presencial
- **iWatt Club:** Largo plazo · blockchain
- **Marca Personal:** Contenido en redes sociales

---

## 👥 Equipo

| Miembro | Rol | Estado | Notas |
|---------|-----|--------|-------|
| Jordan Blancas | Fundador / Owner | Activo | Rol: `owner` en sistema |
| Hermano (nombre pendiente) | Supervisor Creativo | Por confirmar | Maneja Publimania.pe y Facebook Ads |
| Estudiante ejecutor | Ejecutor Creativo | Por contratar | S/600 medio tiempo · remoto + campo |

### Roles del sistema
- `owner` → acceso total (Jordan)
- `manager` → acceso a ventures asignados, puede editar tareas
- `executor` → solo ve sus tareas asignadas

---

## 🛠 Stack Tecnológico

| Herramienta | Uso | Estado |
|-------------|-----|--------|
| **Vercel** | Hosting y deploy automático | ✅ Conectado |
| **GitHub** | Control de versiones | ✅ Repo: `EnergeticaLabs/jordan-holding` |
| **Supabase** | Base de datos + Auth | ✅ Proyecto: `Virtual Flow Holding` |
| **Claude API** | IA y automatización | 🔜 Pendiente |
| **n8n Cloud** | Workflows y orquestación | 🔜 Pendiente |
| **Discord** | Comunidad y ops | 🔜 Pendiente |

### URLs importantes
- **Panel en producción:** https://virtualflow-holding.vercel.app
- **Supabase Project ID:** `xzqiyjczzempnplveeyb`
- **Supabase URL:** `https://xzqiyjczzempnplveeyb.supabase.co`

---

## 🗄 Base de Datos (Supabase)

### Tablas creadas

```
users              → Usuarios del sistema (auth_id, nombre, email, rol)
ventures           → Los 8 ventures del holding
venture_metrics    → 3 métricas por venture (actualizables)
projects           → Proyectos dentro de cada venture
tasks              → Tareas transversales (pueden pertenecer a varios ventures)
roles_permissions  → Control de acceso por usuario y venture
activity_log       → Historial de actividad del equipo
```

### Métricas por venture

| Venture | Métrica 1 | Métrica 2 | Métrica 3 |
|---------|-----------|-----------|-----------|
| Fitbase | Socios activos | Gimnasios cliente | Ingreso mensual (S/) |
| Vatio | Proyectos activos | Cotizaciones enviadas | Ingreso mensual (S/) |
| Élite Cultural | Producciones este mes | Suscriptores podcast | Ingreso mensual (S/) |
| Polímatas Club | Miembros comunidad | Cursos publicados | Ingreso mensual (S/) |
| Energética Labs | Artículos publicados | Visitas mensuales | Ingresos publicidad (S/) |
| Ciencia Poética | Alumnos activos | Cursos disponibles | Ingreso mensual (S/) |
| iWatt Club | Nodos registrados | Capacidad agregada (kW) | Inversión acumulada (S/) |
| Marca Personal | Seguidores totales | Publicaciones este mes | Oportunidades generadas |

### RLS
- Row Level Security activado en todas las tablas
- Políticas abiertas en modo desarrollo (asegurar antes de producción real)

---

## 📁 Estructura del Repo

```
jordan-holding/
├── index.html          → Panel de control principal (SPA)
├── vercel.json         → { "outputDirectory": "." }
├── .gitignore
├── README.md
├── CONTEXT.md          → Este archivo
├── CHANGELOG.md
├── assets/
│   ├── css/
│   ├── js/
│   └── fonts/
├── public/
└── docs/
```

---

## 💻 Panel de Control (index.html)

### Funcionalidades implementadas
- [x] Login real con Supabase Auth
- [x] Dashboard con KPIs del holding
- [x] Grid de 8 ventures con estado, avance y métricas
- [x] Crear tareas (con venture, prioridad, fecha límite)
- [x] Completar tareas
- [x] Feed de actividad reciente
- [x] Módulo de equipo (hardcoded por ahora)
- [x] Vista detallada de ventures con métricas
- [x] Modo light / dark con toggle (preferencia guardada en localStorage)
- [x] Diseño responsivo (desktop / tablet / móvil)
- [x] Sidebar con hamburger menu en móvil
- [x] Cerrar sesión

### Pendiente / Próximos módulos
- [ ] Editar métricas desde el panel
- [ ] Editar avance (%) de cada venture
- [ ] Gestión de usuarios (crear, asignar roles, invitar por email)
- [ ] Filtros de tareas por venture, prioridad, responsable
- [ ] Asignar tareas a miembros del equipo
- [ ] Notificaciones
- [ ] Módulo de proyectos por venture
- [ ] Integración Claude API (asistente interno)
- [ ] Integración n8n (automatizaciones)
- [ ] Seguridad RLS por rol de usuario

---

## 🔑 Variables de Entorno (Vercel)

```
SUPABASE_URL       → https://xzqiyjczzempnplveeyb.supabase.co
SUPABASE_ANON_KEY  → (configurada en Vercel · no commitear)
```

> ⚠️ Las credenciales están hardcodeadas en index.html por ser un sitio estático.
> Para mayor seguridad futura, migrar a Next.js y usar variables de entorno del servidor.

---

## 📋 Decisiones Técnicas Tomadas

1. **SPA en HTML puro** — elegido por simplicidad y velocidad de deploy. Migrar a Next.js cuando el sistema crezca.
2. **Repo público en GitHub** — el código no contiene datos sensibles. Las credenciales van en Vercel env vars.
3. **Supabase Auth** — los usuarios no crean su propia cuenta. Jordan los crea desde el panel (a implementar) y se les envía contraseña temporal.
4. **RLS en modo abierto** — durante desarrollo. Asegurar políticas antes de agregar más usuarios.
5. **Un solo archivo index.html** — toda la app en un archivo mientras sea manejable. Separar cuando supere ~80KB.

---

## 📅 Historial de Sesiones

### Sesión 1 — 21 mayo 2025
- Definición completa del holding y stack
- Creación del repo en GitHub (`EnergeticaLabs/jordan-holding`)
- Deploy en Vercel (virtualflow-holding.vercel.app)
- Diseño y deploy del panel de control
- Configuración de Supabase (7 tablas + datos iniciales)
- Autenticación real implementada
- Modo light/dark + diseño responsivo

---

*Última actualización: 21 mayo 2025 · Sesión 1*
