# Bitácora de uso de IA

## 2026-10-16 — Fundación y vertical slice

- Herramienta: Codex en entorno local Windows; instrucciones del entorno lo identifican como
  agente basado en GPT-6. Variante exacta de modelo no verificada.
- Entrada: requerimiento del usuario y `docs/ARCHITECTURE.md` existente con D1–D7.
  La sesión anterior de grill-me no fue observada; se recibió su documento aprobado.
- Skills consultadas: Ponytail full y Ponytail Review desde la instalación local del plugin.
- Trabajo: backend/API/worker/LangGraph, proveedores Mock/NIM, dominio/persistencia, frontend,
  tests/evals, documentación, CI y plantillas. README evolucionado preservando equipo y secciones;
  marcador oficial actualizado de Reto: 0 a Reto: 1 según instrucción explícita.
- Herramientas: edición local, PowerShell, uv, npm, pytest, Ruff, mypy, Alembic, Vitest,
  TypeScript/Vite; consulta de documentación oficial de LangGraph y catálogo NVIDIA.
- Verificación: ver EVALUATION y REVIEW. Resultados provienen de comandos ejecutados.
- Revisión humana: pendiente. No se atribuyen modificaciones manuales a los integrantes.
- Acciones remotas/Git: no se hicieron commits, pushes, merges, cambios de rama, tags ni Issues.
- Simulación: interpretación mock y transporte HTTP simulado en pruebas NIM, sin llamadas pagadas.

## Activación real posterior — 2026-10-16

Por solicitud del usuario, se comprobó NVIDIA con credenciales ya presentes en `.env`, sin
mostrarlas. Se observaron timeouts en DeepSeek y 404 en Kimi K2.6. Una prueba controlada de
GPT-OSS-20B respondió al retirar `response_format`; se ajustaron `providers.py` y su prueba de
contrato, conservando la validación Pydantic. Las 53 pruebas offline pasaron nuevamente.
Se configuró GPT-OSS-20B en `.env`, con DB/checkpoints separados de la demo mock, y se reiniciaron
API y worker. Un reporte sintético completó los tres agentes con `is_simulated=false` y quedó
WAITING_APPROVAL. No se aprobó en nombre del usuario ni se atribuye una revisión humana completada.
Evidencia y límites: NVIDIA_SMOKE. No se verificó la facturación de las llamadas.

## 2026-10-16 — Auditoría técnica, GAP Analysis y planificación

- Herramienta: Claude Code, modelo Claude Opus 5.5 (`claude-opus-5-5`), a solicitud de Sebastián Feng.
- Objetivo: auditar la fundación, contrastarla con D1–D7 y los requisitos, y planificar las fases
  siguientes. Tarea de **auditoría y planificación**; no se modificó código de aplicación.
- Archivos:
  - creados: `docs/GAP_ANALYSIS.md`, `docs/NEXT_STEPS.md`;
  - reescritos preservando el contenido previo en apéndices: `docs/ROADMAP.md`, `docs/BACKLOG.md`;
  - esta entrada.
- Comandos ejecutados y resultados:
  - `uv sync --locked --check` sin cambios; Ruff y mypy aprobados;
  - pytest: **53 passed**, cobertura 86 %; con `concurrency=greenlet,thread`, **93 %**;
  - npm: lint, typecheck, **6 tests**, build y `audit` (0 vulnerabilidades);
  - `alembic upgrade` + `check` en DB temporal.
- Sondeos de funciones puras (`critical_evidence`, `stated_hours`, `ReportInput`, mock) confirmaron
  los defectos D-01 a D-03.
- Lectura **solo-lectura** de `data/runtime/*.db` para evidencia de inferencia real ya existente.
  No se imprimieron secretos (`.env` se mostró con claves enmascaradas).
- Sin llamadas a NVIDIA ni a GitHub; sin commits, ramas, pushes, Issues ni tableros.
  `scripts/evaluate.py` no se ejecutó porque reescribe resultados versionados.
- La skill Ponytail no estaba disponible en esta sesión y no se utilizó.
- Revisión humana: pendiente. Las prioridades, la asignación de roles y las ADR propuestas
  requieren aprobación del equipo.

## Plantilla para nuevas entradas

Fecha / autor humano / herramienta y modelo conocido / objetivo / archivos / sugerencias aceptadas
y descartadas / cambios manuales verificables / comandos y resultados / revisión humana / límites
y tareas pendientes. Nunca pegar claves ni reportes personales en esta bitácora.
