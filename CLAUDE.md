# Investment Lab — Contexto del proyecto

Este archivo se lee automáticamente al iniciar Claude Code en este repositorio. Contiene el contexto que debes tener siempre presente al trabajar aquí.

## Qué es este proyecto

Plataforma web personal (un solo usuario) para importar, almacenar y analizar inversiones realizadas en XTB. Es un laboratorio personal, no un producto comercial.

Plan funcional completo y hoja de ruta por fases: ver `/docs/planificacion/plan-trabajo-investment-lab.md`.

## Principios que SIEMPRE debes seguir

1. **Simplicidad antes que escalabilidad prematura.** Elige la solución más simple que resuelva el problema actual de la fase en curso.
2. **Nada de sobreingeniería.** Sin microservicios, sin colas de mensajes, sin Redis, sin caching, hasta que exista una razón concreta y medible.
3. **Trabajo por fases, con aprobación explícita.** No implementes funcionalidad de una fase futura aunque parezca sencillo o "ya que estamos". Si algo de otra fase es un prerrequisito real, dilo antes de tocar código, no lo asumas.
4. **Explica antes de construir.** Antes de escribir código para una fase, resume: qué vas a construir, qué decisiones técnicas tomas y por qué, y qué queda fuera. Espera aprobación.

## Stack tecnológico (fijo, no cambiar sin discutirlo)

- **Frontend:** Next.js, TypeScript, TailwindCSS, Shadcn/UI, TanStack Query, Zustand
- **Backend:** Node.js, NestJS, TypeScript, Prisma ORM
- **Base de datos:** PostgreSQL
- **Infraestructura:** Docker, Docker Compose, Cron cuando sea necesario
- **IA:** Claude API (fase posterior del proyecto)
- **Arquitectura:** monolito modular en NestJS (módulos: `portfolio`, `import`, `analysis`, `ai`), NO microservicios.

## Estado actual del proyecto

- Fases completadas: **0, 1, 2, 3, 3.5, 3.6 y 4**. Resúmenes en `/docs/fases/`.
- Fase siguiente: **Fase 5 — Reportes diarios** (aún no iniciada, requiere aprobación explícita).
- Hoja de ruta completa: `/docs/planificacion/plan-trabajo-investment-lab.md`, sección 6.

Estado funcional a hoy: se importan operaciones de XTB, se calculan posiciones,
P&L realizado y no realizado con precios de mercado, métricas de diversificación y
riesgo, gráficos de sector/rendimiento/dividendos, velas por instrumento, y un
asistente de preguntas sobre el portafolio con la API de Claude.

## Convenciones de trabajo

- Commits pequeños y descriptivos, uno por unidad lógica de trabajo dentro de la fase.
- No hardcodear credenciales; usar `.env` (con `.env.example` versionado).
- Antes de dar por cerrada una fase, confirmar que `docker compose up` levanta todo sin errores.
