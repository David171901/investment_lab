# Investment Lab — Documento Funcional y Plan de Trabajo

**Tipo de documento:** Guía funcional y hoja de ruta técnica
**Propósito:** Servir como referencia viva del proyecto: qué se va a construir, en qué orden, por qué, y qué queda fuera de alcance en cada etapa.
**Estado:** Borrador inicial — pendiente de tu aprobación antes de comenzar la Fase 0.

---

## 1. Resumen ejecutivo

Investment Lab es una plataforma personal para importar, almacenar y analizar tus inversiones realizadas en XTB. El objetivo no es construir un producto comercial, sino un **laboratorio personal** que crezca de forma incremental: cada fase agrega una capacidad concreta, se valida, y solo entonces se avanza a la siguiente.

Principios rectores del proyecto:

1. **Simplicidad antes que escalabilidad prematura.** Se elige la solución más simple que resuelva el problema actual.
2. **Iteración corta y aprobada.** Ninguna fase se implementa sin que antes se explique el "qué" y el "por qué", y se apruebe explícitamente.
3. **Datos primero, IA después.** No tiene sentido pedirle análisis a un modelo si el dato subyacente no es confiable. Por eso la IA entra en una fase intermedia/tardía, no en el MVP.
4. **Nada de sobreingeniería.** Sin microservicios, sin colas de mensajes, sin Redis, hasta que exista una razón medible para necesitarlos.

---

## 2. Objetivo del proyecto

Construir una plataforma web personal que permita:

- Importar el historial de operaciones desde XTB.
- Almacenar ese historial de forma estructurada y consultable.
- Calcular métricas de portafolio (rendimiento, P&L, diversificación).
- Generar análisis y recomendaciones explicadas (no genéricas) usando la API de Claude.
- Visualizar todo en un dashboard simple y diario.

### Fuera de alcance (por ahora)

- Multi-usuario / multi-tenant.
- Trading automático o ejecución de órdenes.
- Soporte para brokers distintos a XTB.
- Notificaciones push/email.
- Mobile app nativa.

Estas capacidades no se descartan para siempre; simplemente no son parte del MVP ni de las fases iniciales.

---

## 3. Stack tecnológico confirmado

| Capa            | Tecnología                                                                        |
| --------------- | --------------------------------------------------------------------------------- |
| Frontend        | Next.js, TypeScript, TailwindCSS, Shadcn/UI, TanStack Query, Zustand              |
| Backend         | Node.js, NestJS, TypeScript, Prisma ORM                                           |
| Base de datos   | PostgreSQL                                                                        |
| Infraestructura | Docker, Docker Compose, Cron (cuando sea necesario), Redis (solo si se justifica) |
| IA              | Claude API (extensible a otros modelos a futuro)                                  |

**Decisión de arquitectura general:** monolito modular en el backend (NestJS con módulos bien delimitados: `portfolio`, `import`, `analysis`, `ai`), no microservicios. Un único NestJS + un único Postgres + un único Next.js. Esto es suficiente para uso personal y evita la complejidad operativa de una arquitectura distribuida.

---

## 4. Estrategia de importación desde XTB

XTB no ofrece una API pública oficial y estable para cuentas retail. Existen dos caminos:

1. **Exportación manual (CSV/Excel) desde la plataforma XTB** → importación al sistema mediante un endpoint de carga de archivo. Es el camino más simple, sin riesgo de credenciales, y suficiente para uso diario/semanal.
2. **xAPI no oficial (WebSocket)** de XTB, usada por la comunidad para automatizar. Es más potente (permite sincronización automática) pero no es oficial, puede romperse sin aviso, y requiere manejar credenciales de la cuenta de trading dentro del sistema.

**Recomendación:** comenzar con la opción 1 (importación manual de archivos) en el MVP. Evaluar la opción 2 como una fase posterior, opcional, una vez que el modelo de datos y el análisis ya estén validados con datos reales.

---

## 5. Modelo de datos inicial (propuesta, sujeta a ajuste en Fase 0)

Entidades mínimas para arrancar:

- **Instrument**: símbolo, nombre, tipo (acción, ETF, etc.), mercado/moneda.
- **Operation** (operación/transacción): tipo (compra/venta/dividendo), instrumento, fecha, cantidad, precio, comisión, moneda.
- **Position** (derivada, calculada o materializada): instrumento, cantidad neta actual, precio promedio de compra.
- **PortfolioSnapshot** (opcional, fase posterior): foto diaria del valor total del portafolio, para el histórico de rendimiento.
- **AnalysisRecord** (fase IA): pregunta/contexto, respuesta generada, métricas usadas, fecha.

No se modela `User` como multi-tenant complejo; basta con una entidad simple de configuración de cuenta, ya que el sistema es de un solo usuario.

---

## 6. Hoja de ruta por fases

Cada fase se entrega, se revisa contigo y se aprueba antes de pasar a la siguiente. El orden está pensado para que cada fase dependa solo de lo ya construido.

### Fase 0 — Cimientos del proyecto

- Estructura de repositorio (monorepo simple: `/apps/api`, `/apps/web`, `/packages` si aplica).
- Docker Compose con Postgres + API + Web.
- Setup de NestJS (módulo base) y Next.js (base con Tailwind + Shadcn).
- Prisma configurado con el esquema inicial mínimo (`Instrument`, `Operation`).
- **Entregable:** proyecto corriendo localmente con `docker compose up`, sin funcionalidad de negocio todavía.

### Fase 1 — Importación y almacenamiento de operaciones

- Endpoint para subir el archivo exportado de XTB (CSV/Excel).
- Parser + validación + persistencia en `Operation`.
- Vista simple de listado de operaciones importadas (sin diseño elaborado todavía).
- **Entregable:** puedes importar tu historial real y verlo listado.

### Fase 2 — Cálculo de portafolio y dashboard básico

- Cálculo de posiciones actuales a partir de las operaciones (`Position`).
- Cálculo de P&L (ganancias/pérdidas) y total invertido.
- Dashboard minimalista: resumen general, total invertido, P&L, listado de empresas que posees.
- **Entregable:** primer dashboard funcional con datos reales.

### Fase 3 — Métricas financieras y rendimiento histórico

- Rendimiento histórico (requiere `PortfolioSnapshot` o cálculo derivado).
- Métricas de diversificación (concentración por instrumento/sector).
- Indicadores de riesgo básicos (peso relativo de cada posición).
- **Entregable:** el dashboard responde "¿estoy diversificado?" con datos, sin IA todavía.

### Fase 4 — Integración de IA (Claude API)

- Módulo `analysis` que arma el contexto financiero real (posiciones, métricas, historial) y se lo pasa a Claude.
- Prompts diseñados para que toda recomendación incluya: ventajas, riesgos, escenarios, nivel de confianza y datos usados.
- Respuestas para preguntas tipo: rendimiento por posición, riesgo concentrado, oportunidades acordes al portafolio actual.
- **Entregable:** puedes hacer preguntas sobre tu portafolio y recibir respuestas justificadas, no genéricas.

### Fase 5 — Reportes diarios

- Cron job (dentro de NestJS, sin infraestructura adicional) que genera un resumen diario del estado del portafolio.
- Persistencia del reporte para consulta histórica en el dashboard.
- **Entregable:** cada día tienes un resumen automático sin tener que pedirlo manualmente.

### Fase 6 — Mejoras según necesidad real (backlog abierto)

Solo se evalúan si, tras usar el sistema, surge una necesidad concreta:

- Redis para cachear cálculos costosos.
- Sincronización automática vía xAPI no oficial.
- Comparación de escenarios / simulaciones "qué pasaría si".
- Multi-modelo de IA.

---

## 7. Metodología de trabajo

Para cada fase, antes de escribir código se entregará:

1. Qué funcionalidades concretas se van a construir.
2. Qué decisiones técnicas se toman y por qué son las adecuadas para el estado actual del proyecto (no en abstracto).
3. Qué queda explícitamente fuera de esa fase.
4. Espacio para tu aprobación o ajustes antes de implementar.

No se avanza a la fase N+1 sin que la fase N esté aprobada.

---

## 8. Próximos pasos

1. Revisar y ajustar este documento si algo no refleja lo que quieres (orden de fases, alcance del MVP, modelo de datos).
2. Aprobar la Fase 0 para comenzar con la estructura base del proyecto.
