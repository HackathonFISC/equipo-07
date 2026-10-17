# Metodología, despliegue y funcionamiento

Documento de entrega del Reto 1 (Agua). Resume cómo trabajamos, cómo funciona AguaIA y cómo se
despliega. El detalle técnico vive en [ARCHITECTURE](ARCHITECTURE.md) (decisiones D1–D7),
[IMPLEMENTATION](IMPLEMENTATION.md), [EVALUATION](EVALUATION.md), [GUARDRAILS](GUARDRAILS.md) y
[DATA_SOURCES](DATA_SOURCES.md).

## 1. Cómo trabajamos

**Del problema a los requisitos.** Partimos de la pregunta del reto: con reportes ciudadanos
desordenados y pocas cisternas, ¿a quién se atiende primero y por qué? Antes de escribir código se
fijaron las decisiones D1–D7 (agentes, contratos, worker durable, humano en el ciclo, datos), los
requisitos en [REQUIREMENTS](REQUIREMENTS.md) y el catálogo de agentes en
[AGENT_CATALOG](AGENT_CATALOG.md). Las cifras del problema solo se usan con fuente; lo sintético
se marca como tal ([DATA_SOURCES](DATA_SOURCES.md)).

**Fases cortas con revisión.** El trabajo se dividió en fases (F0 línea base, F1 priorización,
F2 ciclo funcional, F3 datos e impacto, F4 robustez, F5 impacto en la interfaz, F6 documentación,
F7 instalación limpia y corrida real). Cada fase tenía un plan con criterios de aceptación.
Un asistente de IA la ejecutaba, otro la revisaba contra el plan y el código, y el equipo decidía
qué se integraba. Ningún push, merge o tag se hizo sin autorización explícita de un integrante.
El reparto de herramientas está en la [bitácora de IA](AI_LOG.md).

**Reglas que guiaron el diseño.**

- El LLM interpreta lenguaje; el código decide. Puntaje, rutas, asignación y verificaciones son
  determinísticos y probados.
- Ninguna decisión que mueva agua sale sin aprobación humana, y aprobar una prioridad no despacha
  una cisterna.
- Fallar a la vista antes que inventar: sin fallback silencioso al mock, sin horas ni
  instituciones que el texto no menciona, sin rutas a sectores sin coordenadas.
- Simplicidad: un monolito modular, un worker y SQLite. Sin microservicios ni infraestructura que
  la demo no necesita.

**Calidad.** Cada cambio actualiza requisito, contrato, código, prueba y documentación juntos.
Pruebas unitarias, de API, de base de datos, del grafo LangGraph, de contratos NIM con transporte
simulado y de componentes de la interfaz; 54 evals de escenarios y una métrica de impacto
([EVALUATION](EVALUATION.md)). CI en GitHub Actions corre lint, tipos, migraciones, pruebas y evals
en Ubuntu y Windows, y lint, tipos, pruebas y build del frontend.

## 2. Cómo funciona

```
Ciudadano (web o Telegram)
  → API: guarda el reporte y responde 202 con un código de seguimiento
  → Worker + LangGraph:
      1 Ingesta        normaliza el texto; compuertas de fundamentación (horas, institución)
      2 Verificación   agrupa con incidentes del mismo tipo y sector en 72 h
      3 Coordinación   puntaje 0–100 por código; el LLM solo lo explica
  → Aprobación humana 1: el coordinador aprueba, corrige o rechaza la prioridad, con razón
  → 4 Planificador   solver determinístico de cisternas + comparación con dos baselines
  → Aprobación humana 2: el coordinador aprueba o rechaza el plan
  → 5 Comunicación   avisos con hora estimada en la web y por Telegram
```

- **Trazabilidad.** Cada paso deja una traza con el agente, la herramienta y el detalle; las
  decisiones humanas quedan auditadas con su razón. El expediente del coordinador las muestra.
- **Errores visibles.** Si el modelo falla o una compuerta lo bloquea, la ejecución queda en
  ERROR con un código controlado (`UNGROUNDED_HOURS`, `APITimeoutError`…) y el coordinador
  puede reintentarla. El reporte nunca se pierde ni se reemplaza por una simulación.
- **Modos.** `mock` corre la demo completa sin red y se presenta como simulación. `nvidia` usa
  NVIDIA NIM (`openai/gpt-oss-20b` para texto y un modelo de visión para fotos).
- **Fotos.** El análisis de la foto del ciudadano es orientativo: se muestra al coordinador y no
  cambia el puntaje.

## 3. Despliegue

**Local (la demo).** Cuatro procesos, cada uno en su terminal (comandos exactos en el
[README](../README.md#instalación-y-ejecución)):

| Proceso | Comando (desde `backend/` o `frontend/`) | Necesario |
|---|---|---|
| API FastAPI | `uv run uvicorn app.api:app --host 127.0.0.1 --port 8000` | Sí |
| Worker | `uv run python -m app.worker` | Sí |
| Interfaz | `npm run dev` | Sí |
| Bot de Telegram | `uv run python -m app.integrations.telegram` | Opcional |

Antes del primer arranque: copiar `.env.example` a `.env`, `uv run alembic upgrade head` y
`uv run python -m app.seed` (idempotente). Para el escenario F2-01:
`uv run python ../scripts/seed_demo_scenario.py`.

**Persistencia.** Dos archivos SQLite bajo `data/runtime` (ignorado por Git): uno de negocio y
otro de checkpoints de LangGraph. Deben ser archivos distintos y respaldarse juntos, con API y
worker detenidos.

**Tolerancia a fallos.** La API acepta reportes y decisiones aunque el worker esté apagado; quedan
en cola durable hasta que arranca ([ADR 001](adr/001-durable-worker.md)). Un candado de proceso
impide dos workers a la vez, y al reiniciar se recuperan los trabajos interrumpidos.

**Secretos.** `NVIDIA_API_KEY` y `TELEGRAM_BOT_TOKEN` solo en `.env`, nunca en el frontend ni en
Git. El token de coordinador de `.env.example` es público y solo para localhost.

**Hacia producción (no implementado).** Servir `frontend/dist` y `/api` en el mismo origen con
HTTPS, un supervisor que reinicie API y worker, PostgreSQL en lugar de SQLite, identidad individual
para coordinadores en lugar del token compartido y un único worker por base. Vite es solo servidor
de desarrollo.

## 4. Límites conocidos

- Las demandas, la flota y varios sectores son supuestos de demo, marcados en DATA_SOURCES.
- Las evals miden cumplimiento de escenarios con el mock; en modo real se comprobó la corrida
  F2-01 completa, no un benchmark del modelo.
- La entrega real de agua se confirma fuera del sistema: «programado» no significa «entregado», y
  los incidentes todavía no tienen un cierre en la aplicación.
