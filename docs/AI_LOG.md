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

## Rediseño de UI y optimización de prompts — 2026-10-16

- Herramienta: Antigravity Assistant.
- Objetivo: Evaluar y resolver la confusión de interfaz reportada por el equipo, enriquecer los prompts del sistema (Mock y NVIDIA NIM) y refactorizar el frontend hacia un Centro de Mando Operativo y Portal Ciudadano empático.
- Archivos modificados:
  - `backend/app/providers.py`: Prompts de sistema enriquecidos con contexto de Panamá Oeste para `extract_report`, `evaluate_duplicate` y `explain_priority_proposal`. Justificaciones determinísticas elocuentes en `MockLLMProvider`. Líneas ajustadas al límite de 100 caracteres de Ruff.
  - `frontend/src/components.tsx`: Nuevos componentes `PriorityGauge` (medidor 0-100 visual), `FactorBar` (barras individuales de factores ponderados), `ProcessStepper` (seguimiento de 4 pasos para ciudadanos), `KpiCard` (tarjetas ejecutivas de resumen) y `StatusBadge` enriquecido con tonos semánticos.
  - `frontend/src/pages/CitizenPage.tsx`: Stepper de progreso en vivo, chips de prueba rápida para Panamá Oeste (cortes, fugas, centros de salud), agrupación de comunidades por distrito y explicaciones ciudadanas sin tecnicismos.
  - `frontend/src/pages/CoordinationPage.tsx`: Dashboard de KPIs ejecutivos, barra de búsqueda y filtros rápidos (Todos, Pendientes HITL, Aprobados), visualización gráfica del intervalo de prioridad y factores, sección interactiva de recomendación de camiones cisterna de Panamá Oeste (`tanker_fleet.json`), y línea de tiempo multiagente estructurada.
  - `frontend/src/App.tsx`: Header moderno con navegación clara, indicador de estado de servicio y pantalla de acceso institucional.
  - `frontend/src/styles.css`: Nueva hoja de estilos responsiva, accesible, con contraste optimizado y estética de centro de operaciones.
- Comandos ejecutados y resultados:
  - `npm.cmd test`: 6/6 pruebas unitarias e integración en Vitest pasaron exitosamente.
  - `npm.cmd run typecheck`: TypeScript pasó sin errores (`tsc --noEmit`).
  - `npm.cmd run lint`: ESLint pasó limpio en todo el frontend.
  - `npm.cmd run build`: Vite generó bundle de producción sin advertencias en 7.22 s.
  - `python -m uv run ruff check app tests migrations`: 0 errores de linting.
  - `python -m uv run mypy`: 0 errores de tipado estático.
  - `python -m uv run pytest -q -p no:cacheprovider --cov=app`: 53/53 pruebas pasaron (87% de cobertura).
  - `backend\.venv\Scripts\python.exe scripts\evaluate.py`: 22/22 casos de evaluación oficiales superados.
  - `backend\.venv\Scripts\python.exe scripts\validate_datasets.py`: 100% de datasets y GeoJSON validados.
- Revisión humana: Pendiente de validación visual por el equipo.

## Usabilidad del Portal Ciudadano — 2026-10-16

- Herramienta: Claude Code (Opus 5.5) con skills MIT de `mastepanoski/claude-skills` instalados en
  `.claude/skills/` (`nielsen-heuristics-audit`, `cognitive-walkthrough`, `wcag-accessibility-audit`).
- Objetivo: adaptar la vista ciudadana a personas de todas las edades; informe en `docs/UX_AUDIT_CIUDADANO.md`.
- Archivos: `frontend/src/pages/CitizenPage.tsx`, `components.tsx`, `App.tsx`, `styles.css`, `App.test.tsx`.
- Cambios: textos en lenguaje llano; formulario primero; ejemplos de demo solo si `is_simulated`;
  duración en opciones de días mapeadas dentro de los tramos de `domain.py` (6/18/36/48 h o `null`);
  botón "Copiar código"; "Completar mi reporte" en NEEDS_INFORMATION; acceso de coordinación en el pie;
  texto base 16 px, `--text-light` con contraste ≥ 4.5:1, `:focus-visible` global, stepper como `<ol>` con `aria-current`.
  Sin cambios de contrato HTTP.
- Comandos: `npm run lint` limpio; `npm run typecheck` sin errores; `npm test` 7/7; `npm run build` correcto.
- Revisión humana: pendiente validación visual y prueba con personas mayores reales.
- Pendiente: consulta pública de estado por código y canal oficial de ayuda (requieren acuerdo de contrato/equipo).

## Agente planificador de cisternas con aprobación humana — 2026-10-16

- Herramienta: Claude Code (Opus 5.5).
- Objetivo: cubrir el núcleo del Reto 1 ("plan de distribución justo, rápido y explicable") y
  sustituir la recomendación de cisterna fija del frontend (`tankerFleetRecommendations`, marcada
  "VRP simulado") por un planificador real en el backend.
- Archivos: `backend/app/planner.py` (nuevo, solver puro), `contracts.py`, `models.py`,
  migración `9b1c2d3e4f50_distribution_plans.py`, `services.py`, `tools.py`, `agents.py`
  (`PlannerAgent`), `worker.py`, `api.py`; `frontend/src/pages/PlanPanel.tsx` (nuevo),
  `CoordinationPage.tsx`, `types.ts`, `styles.css`; tests `test_planner.py`, `test_evaluations.py`
  (E23–E31), `test_domain.py`, `App.test.tsx`; `evals/cases.json`, `scripts/evaluate.py`.
- Diseño: rondas por prioridad aprobada (cada comunidad recibe una primera carga antes de una
  segunda), capacidad de cisterna, capacidad máxima del acceso vial, turno con regreso a planta y
  recarga. Distancia = línea recta × 1.4 a 30 km/h (supuesto declarado, no tráfico real).
  Fugas, sectores sin coordenadas o sin demanda estimada se listan como no atendidos con motivo.
- Privacidad: `/api/fleet/tankers` publicaba sin autenticación cédulas y teléfonos de conductores de
  `data/tanker_fleet.json`. Se reemplazó por `/api/admin/fleet` (con token, solo campos operativos).
  Los datos personales siguen en el archivo de datos: el equipo debe decidir si eliminarlos.
- Comandos: ruff, ruff format y mypy limpios; `pytest` 69/69 (87 %); `scripts/evaluate.py` 31/31;
  frontend lint, typecheck y Vitest 8/8.
- Verificación manual: instancia aislada (DB temporal y token de prueba) con 8 reportes; plan
  generado, revisado y aprobado desde la interfaz; incidentes con ruta pasaron a SCHEDULED.
- Revisión humana: pendiente revisión del equipo de los supuestos del solver y de la flota.
- Límites: heurística determinística (no óptimo global, sin OR-Tools); sin ventanas horarias por
  destino; aprobar programa rutas, no confirma entregas.

## Fase F0: Línea Base — 2026-10-16

- Herramienta: Antigravity (Gemini 3.8 Flash) en entorno Windows.
- Objetivo: Ejecutar la Fase F0 (Línea Base) completa sin modificar código de aplicación:
  - Ejecución de la suite R0 completa (Backend, Evals, Datasets, Frontend).
  - Verificación empírica del hallazgo H6 (comportamiento de arraijan-demo sin coordenadas vs comunidad con coordenadas).
  - Verificación empírica del hallazgo H11 (fallo UNGROUNDED_HOURS ante duraciones expresadas en días).
  - Documentación consolidada en `docs/evidence/baseline.md`.
- Archivos:
  - creados: `docs/evidence/baseline.md`.
  - actualizados por runner oficial: `evals/results.json`, `evals/results.xml`.
- Comandos ejecutados y resultados:
  - Backend: `uv sync --locked` (72 paquetes); `ruff check` limpio; `ruff format --check` limpio (27 archivos); `mypy` sin errores (0 issues); `pytest -q -p no:cacheprovider --cov=app`: 75 passed en 221.23s, 87 % de cobertura. `alembic upgrade head` y `alembic check` limpios.
  - Evals: `scripts/evaluate.py`: 31/31 passed en 40.26s (100 %).
  - Datasets: `scripts/validate_datasets.py`: 20/20 ubicaciones válidas, 4 cisternas; `git diff data/` limpio.
  - Frontend: `npm.cmd run lint` limpio; `npm.cmd run typecheck` limpio; `npm.cmd test` 8 passed en 21.99s; `npm.cmd run build` limpio en 6.64s.
- Desviaciones (añadidas tras revisión con Claude Code, Opus 5.5; detalle en `docs/evidence/baseline.md` §5):
  - pytest: la 1.ª ejecución falló en `test_real_http_queue_and_worker_restart`; la 2.ª pasó (75). Causa no determinada: prueba intermitente.
  - `npm ci` falló por binarios bloqueados; se usó `npm install`, que modificó `package-lock.json` (restaurado). El paso `npm ci` de R0 no está verificado.
  - Node v22.18.0 en lugar del 24.19.0 declarado en `.node-version`.
  - H6 y H11 se verificaron con scripts exploratorios eliminados después, no con la prueba manual M0, que sigue pendiente.
  - Trabajo hecho sobre `main` con cambios sin commitear; el commit `524e7d4` amplió `guard_text` y se solapa con F4-03.
- Cierre de desviaciones 1–4 (Claude Code, Opus 5.5; detalle en `docs/evidence/baseline.md` §6):
  - Test e2e intermitente: 2/5 ejecuciones pasan. Causa medida: el arranque en frío del worker tarda 12–33 s y el test espera 15 s. Sin error de lógica. Arreglo del plazo propuesto para el inicio de F1.
  - `npm.cmd ci` en verde sin cambiar el lockfile; lint, typecheck, Vitest 8/8 y build en verde.
  - Node 22.18.0 aceptado por decisión del equipo como entorno probado; `.node-version`, README y CI siguen en 24 (pendiente F6).
  - M0 ejecutada en instancia aislada (8010/5180, base de datos temporal, mock): reporte → APPROVED 68 → plan 3 rutas 15 000/15 000 gal → SCHEDULED. Capturas y JSON en `docs/evidence/m0/`.
  - La API y el Vite del equipo se detuvieron con su autorización; otro proceso los relanzó en 8000/5173. El worker del equipo no se tocó.
- Verificación empírica H6 y H11:
  - H6 confirmado: `arraijan-demo` produce `SIN_UBICACION`, mientras que `crit-hosp-nicolas-solano` genera 3 rutas y 15,000 galones planificados.
  - H11 confirmado: `stated_hours("Tenemos 3 días sin agua en el barrio")` devuelve `[]`. Cuando el LLM extrae `72.0`, el grounding lanza `ProviderError("UNGROUNDED_HOURS")` y el worker termina en `ERROR`.
- Acciones Git: No se realizaron commits, pushes, merges ni tags no autorizados.

## Plantilla para nuevas entradas

Fecha / autor humano / herramienta y modelo conocido / objetivo / archivos / sugerencias aceptadas
y descartadas / cambios manuales verificables / comandos y resultados / revisión humana / límites
y tareas pendientes. Nunca pegar claves ni reportes personales en esta bitácora.

