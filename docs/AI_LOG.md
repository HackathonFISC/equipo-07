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

## 2026-10-17 — Fase 1 (F1): Núcleo de Priorización

- Autor humano / Solicitud: "adelante con el plan" (autorización explícita para Fase 1 y rama `feat-fase-1-priorizacion`).
- Herramienta: Antigravity Assistant (Gemini 3.8 Flash High).
- Decisiones consolidadas aplicadas:
  - D-01: Rama dedicada `feat-fase-1-priorizacion` (ref `feat/` renombrada por conflicto con ref de archivo Git).
  - D-02: `is_critical_location` reconoce `category == "institucion_critica"` (salud, escuelas, asilos); nunca `planta_potabilizadora`.
  - D-03: `ReviewInput` admite `approved_score` determinístico en el intervalo `[score_min, score_max]`; responde HTTP 422 si falta en una propuesta con rango.
- Archivos creados y modificados:
  - `backend/app/grounding.py` (creado): Módulo puro de fundamentación lingüística con negación acotada sobre instituciones y parseo temporal de horas, días, semanas y expresiones imprecisas (`extract_temporal_grounding`).
  - `backend/tests/test_grounding.py` (creado): 30 pruebas unitarias parametrizadas para criticidad, horas y duraciones imprecisas.
  - `backend/app/domain.py`: Añadidas funciones puras `is_critical_location` y `resolve_criticality`.
  - `backend/app/tools.py`: `report_context` enriquecido con `in_catalog` y `catalog_critical`.
  - `backend/app/agents.py`: `Agents.coordinate` usa `resolve_criticality` y propaga banderas `CRITICIDAD_CATALOGO`/`CRITICIDAD_TEXTO`; `Agents.ingest` evita `UNGROUNDED_HOURS` ante duraciones imprecisas; `PlannerAgent.plan` homologado con `is_critical_location`.
  - `backend/app/contracts.py`: `ReviewInput` extendido con `approved_score`.
  - `backend/app/services.py`: Validación transaccional de `approved_score` en `enqueue_review` y persistencia en `apply_decision`.
  - `backend/tests/test_process_e2e.py`: Aumentado timeout de `wait_until` (30 s; después 60 s en la revisión) y agregado `approved_score` en revisión.
  - `backend/tests/test_evaluations.py`: Implementados escenarios E32 a E40 y actualizado helper `approved()`.
  - `evals/cases.json`: Añadidos escenarios E32 a E40.
  - `scripts/evaluate.py`: Agregado grupo `priority_scenarios` (9 escenarios).
  - `frontend/src/types.ts`: `Review` extendido con `approved_score?: number`.
  - `frontend/src/pages/CoordinationPage.tsx`: Formulario de revisión adaptado para solicitar y precargar `approvedScore` ante propuestas con rango.
  - `docs/REQUIREMENTS.md`: Registrados requisitos RF14, RF15 y RF16 (renumerados desde RF12–RF14 para no chocar con RF12/RF13 de la rama `ag45-whatsapp-telegram`).
- Comandos ejecutados y resultados (Suite R0 completa):
  - Backend: `ruff check` (PASS), `ruff format --check` (PASS), `mypy` (PASS, 0 issues), `pytest -q -p no:cacheprovider --cov=app`: **114 passed en 178.39s**, cobertura **87%**; `alembic check`: *No new upgrade operations detected*.
  - Evaluaciones: `scripts/evaluate.py`: **40/40 passed (100%)** en 35.13s (incluyendo 9/9 en `priority_scenarios`).
  - Datasets: `scripts/validate_datasets.py`: 20/20 ubicaciones válidas, 4 cisternas; `git diff data/` = limpio.
  - Frontend: `npm.cmd run lint` (0 errors), `npm.cmd run typecheck` (0 errors), `npm.cmd test` (8 passed), `npm.cmd run build` (exitoso).
- Acciones Git: Rama creada y activada `feat-fase-1-priorizacion` con autorización explícita; ningún commit o push remoto ejecutado sin autorización.

## Revisión y correcciones de F1 — 2026-10-17

- Herramienta: Claude Code (Opus 5.5), a pedido del usuario, sobre `feat-fase-1-priorizacion` sin commits.
- Correcciones:
  1. `services.enqueue_review`: restaurada la validación que responde 409 si llega `association` sin
     asociación tentativa (se había eliminado al añadir `approved_score`). Nueva aserción en
     `test_security_and_conflicts`; se comprobó que falla sin la validación (202 ≠ 409) y pasa con ella.
  2. `frontend/src/App.test.tsx`: espera de la opción de comunidad con 5 s en lugar de 1 s. Antes falló
     2 de 4 ejecuciones; después, 1 falla aislada en 29 ejecuciones (2 tests, sin detalle capturado).
     Riesgo residual registrado.
  3. `test_process_e2e.py`: plazo de 60 s (arranque en frío del worker medido en 12–33 s). 3/3 en verde.
  4. `grounding.py`: «el/al/del medio día» (mediodía) ya no cuenta como 12 h; se reutiliza
     `contracts.plain` en lugar de una copia. Dos casos nuevos en `test_grounding.py`.
  5. `REQUIREMENTS.md`: RF12–RF14 renumerados a RF14–RF16 (RF12/RF13 los usa `ag45-whatsapp-telegram`),
     estado «Implementado» y criticidad descrita por `category`, no por `is_critical_lifeline`.
- R0 tras las correcciones: `uv sync --locked`, ruff, formato y mypy limpios; `alembic upgrade head` y
  `check` en base temporal limpios; pytest **116 passed**, cobertura 87 % (`grounding.py` 100 %);
  `evaluate.py` **40/40** (priority 9/9); `validate_datasets.py` rc=0 y `git diff data/` vacío;
  frontend lint, typecheck y build OK, Vitest 8/8 en 3 ejecuciones seguidas.
- No ejecutado: `npm ci` (hay un Vite del equipo corriendo sobre `node_modules`; ya se verificó en F0).
- Límite conocido: «El hospital no tiene problemas…» sigue contando como evidencia crítica (falso positivo);
  medirlo con el corpus de F4.

## F3-02 y F3-03: upsert del seed y métrica de impacto — 2026-10-17

- Herramienta: Claude Code (Opus 5.5), a pedido del usuario, en la rama `feat-f3-impacto` (worktree
  aparte para no chocar con F2), sin commits.
- F3-02: `seed.py` usa `session.merge` (upsert). `test_seed.py` comprueba que un cambio de población y
  vulnerabilidad llega a una base existente, que una comunidad nueva se inserta, que repetir no duplica y
  que los reportes se conservan.
- F3-03: `app/impact.py` (puro) reutiliza `calculate_priority`, `resolve_criticality`, `stated_hours` y
  `plan_distribution` sin modificarlos. Baselines con rangos únicos y `critical=False`, para que el
  desempate del planificador no los favorezca ni perjudique. `not_better` lista las métricas donde
  AguaIA no gana; se publican.
- Supuestos (también en `evals/impact.json`): tipo de incidencia por el proveedor mock; el coordinador
  aprueba el punto medio del rango; tiempos desde el primer turno.
- Duplicación aceptada: `trucks_from_catalog` y la agrupación de `build_demands` repiten la lógica de
  `PlannerAgent.plan` porque `agents.py` está en edición por F2; unificar tras integrar F2.
- Rama actualizada con `main` (F2, 9785057); conflicto en `REQUIREMENTS.md` resuelto conservando
  RF17–RF19, RNF08, RF30 y RF31.
- `evals/impact.json` generado con `data/demo_scenario.json` de F2-01 (sha256 a54bfb62…); dos
  corridas dan el mismo archivo. Resultado: cobertura crítica 100 % en las tres estrategias (sin
  ganancia, publicado en `not_better`); mediana hasta la primera entrega crítica **143 min** (AguaIA)
  frente a **292 min** (volumen y llegada), máximo 180 frente a 293 min; 6/6 comunidades atendidas en
  todas. Excluidas por igual: la fuga de `ref-parque-feuillet` y `sector-sin-censo` (sin coordenadas).
- R0 tras integrar F2: ruff, formato y mypy limpios; `alembic upgrade head` + `check` limpios; pytest
  **127 passed**, cobertura 86 %; `evaluate.py` 40/40; `validate_datasets.py` rc=0 sin diff en
  `data/`; frontend `npm ci`, lint, typecheck, Vitest 9/9 y build OK.

## Plantilla para nuevas entradas

Fecha / autor humano / herramienta y modelo conocido / objetivo / archivos / sugerencias aceptadas
y descartadas / cambios manuales verificables / comandos y resultados / revisión humana / límites
y tareas pendientes. Nunca pegar claves ni reportes personales en esta bitácora.

## 2026-10-17 — Fase 2: Cierre del ciclo funcional (F2-01 a F2-06)

- Herramienta: Antigravity Assistant.
- Objetivo: Implementar la Fase 2 completa según el plan aprobado por el auditor arquitectónico (F2-01 a F2-06):
  1. F2-01: Escenario reproducible de demo (`data/demo_scenario.json` con 12 reportes y script `scripts/seed_demo_scenario.py` con UUIDv5 y backoff).
  2. F2-02: Agente 5 de Comunicación determinístico (`CommunicationAgent`) + tabla `notifications` con `UniqueConstraint("plan_id", "community_id")` + migración Alembic `5ed0c1f96df0` y procesamiento en ciclo de `worker.py`.
  3. F2-03: Endpoint público seguro `GET /api/reports/{id}/public-status` sin fuga de trazas ni de IDs de incidentes.
  4. F2-04: UI ciudadana con consulta por código UUID, tarjeta de aviso de llegada con hora estimada (ETA) y leyenda de programación del mismo día.
  5. F2-05: Línea de tiempo unificada `GET /api/admin/incidents/{id}/timeline` y modal `IncidentTimelineModal` en `CoordinationPage`.
  6. F2-06: Documentación y flujo de demo actualizados (`docs/DEMO.md`, `README.md`, `docs/AGENT_CATALOG.md`, `docs/REQUIREMENTS.md`, eliminación de `arraijan-demo` de los chips rápidos de demo para resolver H6).
- Archivos creados:
  - `data/demo_scenario.json`
  - `scripts/seed_demo_scenario.py`
  - `backend/migrations/versions/5ed0c1f96df0_create_notifications_table.py`
  - `backend/tests/test_communication.py`
- Archivos modificados:
  - `backend/app/models.py`, `backend/app/contracts.py`, `backend/app/tools.py`, `backend/app/agents.py`, `backend/app/worker.py`, `backend/app/services.py`, `backend/app/api.py`
  - `frontend/src/types.ts`, `frontend/src/pages/CitizenPage.tsx`, `frontend/src/pages/CoordinationPage.tsx`, `frontend/src/styles.css`, `frontend/vite.config.ts`
  - `docs/REQUIREMENTS.md`, `docs/AGENT_CATALOG.md`, `README.md`, `docs/DEMO.md`, `docs/AI_LOG.md`
- Verificación ejecutada:
  - Backend Alembic: `alembic upgrade head`, `alembic check` limpios; reversibilidad probada en `test_migrations.py`.
  - Frontend: `npm run lint` (0 errors), `npm run typecheck` (0 errors), `npm test` (8/8 passed), `npm run build` (0 errors).
- Límites y advertencias: Comunicación determinística sin LLM; endpoint público restringido sin información sensible; ningún commit ni push remoto sin autorización explícita.


## 2026-10-17 — Revisión y correcciones de F2

- Herramienta: Claude Code (Opus 5.5), a pedido del usuario, sobre el árbol de trabajo sin commits.
- Correcciones:
  1. `worker.process_notifications`: un plan aprobado sin paradas ni demandas no genera filas y se
     reelegía en cada vuelta (bucle en caliente, verificado con una prueba temporal: `[True, True, True]`).
     Ahora el evento `NOTIFICATIONS_GENERATED` también lo marca como procesado, y un fallo del agente
     devuelve `False` para que el bucle duerma. Test `test_worker_does_not_spin_on_empty_or_failing_plans`.
  2. `CitizenPage`: el polling del estado público se detenía en `APPROVED` (prioridad), antes de que
     exista el aviso del plan, así que la hora estimada no aparecía sin recargar. `publicStatusPolling`
     sigue cada 10 s mientras el estado es `APPROVED` sin aviso. Test `api.test.ts`.
  3. `DEMO.md`: el catálogo no son «coordenadas reales del IDAAN» (no hay datos oficiales); el script se
     ejecuta con el Python del backend (`httpx`); la exclusión de `cisterna-hospital-01` se hace a mano;
     el texto «Aprobar acepta el límite inferior» se reemplazó por la regla D-03.
- Verificación: ruff, formato y mypy limpios; pytest de comunicación, resiliencia y planificador
  22 passed; frontend lint y typecheck limpios, Vitest 9/9.
