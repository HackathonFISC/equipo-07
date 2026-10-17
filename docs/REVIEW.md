# Ponytail review — 2026-10-16

## Integración AG-52 · 2026-10-17

Revisión asistida local del diff y consumidores conectados; no es aprobación humana independiente.
CitizenPage conserva intervalos, ReportsPanel consume report/inputs y separa operación de una
Auditoría principal accesible. Se mantienen decisiones, mapa, flota, planes y evidencia.
Se revisaron contratos Pydantic reales, OpenAPI servido, fixtures, llamadas y pruebas.
Sin cambios al servidor ni a políticas, agentes o solver; sin nueva dependencia.

Correcciones verificadas durante integración:

1. No convertir 6/18/36/48 representativos en horas; también adaptar los ejemplos mock.
2. No consultar timeline para datos originales ni explicar propuestas con el catálogo actual.
3. No preseleccionar el promedio de un rango; validar entero dentro del intervalo explícito.
4. No confundir revisión recibida con aplicada; conservar aplicación aunque falle después el grafo.
5. No certificar datos por tener confianza HIGH; procedencias y datos sintéticos siguen visibles.
6. No presentar explicaciones históricas como hechos; conservarlas completas con advertencia.
7. Preservar edición al alternar Operación/Auditoría; mantener historial y relación con planes.
8. Corregir desbordamiento de cabecera móvil observado con Chrome; seis pestañas visibles.

Validación: 30 Vitest, lint/typecheck/build; 196 pytest (88 %), Ruff/formato/mypy; Alembic único
head y upgrade/check en aislamiento. Flujo HTTP real con React, FastAPI, LangGraph y worker;
revisión pendiente/aplicada, propuesta y aprobación de plan, mapa, aviso público. Chrome claro,
oscuro, movimiento reducido y móvil; sin errores JS/HTTP en el recorrido final. Mock explícito.
Evidencia y limitaciones en [AG-52](evidence/ag52/README.md) y [UI](UI.md).

### PR preparado localmente · AG-52 (no publicado)

**Título:** fix: integrar intervalos y separar operación de auditoría en Coordinación.

**Problema y comportamiento resultante:** el formulario enviaba horas representativas y el detalle
buscaba datos originales en otro endpoint. Ahora conserva el intervalo, muestra report/inputs con
procedencia y mantiene una vista operativa breve junto a Auditoría visible con trazabilidad
disponible. Revisiones registradas y aplicadas son estados distintos; un rango exige elección humana.

**Requisitos:** RF34, RF40 y RNF11; AG-52 local, sin Issue remoto.

**Validación:** comandos y resultados anteriores; negativos de rango vacío/fuera de límites,
contrato incompatible 422, acceso 401, históricos sin inputs, fallo del timeline, corrección/rechazo
y formulario conservado entre vistas. Mapa/planificador conservados y comprobados.

**Contratos y datos:** adopción TS de campos aditivos existentes, sin migración nueva ni cambios de
Pydantic/OpenAPI; compatibles registros antiguos sin report/inputs. Nuevo API_PROXY_TARGET de Vite;
8000 predeterminado documentado, prueba con puerto dinámico. Token solo en memoria React.

**Checklist:** alcance y diff revisados; pruebas, docs, catálogo y bitácora actualizados; sin secretos
ni datos personales en evidencia, decisiones sintéticas identificadas. Revisión por otro integrante
pendiente. Sin commits, ramas, pushes, merges ni acciones remotas.

No comprobado: NVIDIA real, Linux/PostgreSQL, carga sostenida ni prueba con coordinadores reales.
El timeline conserva sus límites de 20 planes/50 avisos y el estado del incidente el lookup de 100.

## Ponytail Review · AG-41 · 2026-10-17

What this change does: preserves declared duration intervals, stores the inputs behind each
priority and explains them without an LLM. It also keeps scheduled incidents scheduled when a
duplicate is approved, rejects incomplete provider output and makes failures traceable by node.

Scope: uncommitted backend changes and their callers (API, graph, tools, worker, messaging,
impact fixtures and tests). Read frontend consumers to specify the additive contract, without
editing them. Expected load: one local worker; no claim of multiple-host concurrency or NIM accuracy.
This is an assisted local review, not an independent human sign-off.

Checks and corrections made during review:

1. Preserve old Idempotency-Key hashes when the new duration_bucket is absent/null.
2. Check buckets against textual exact hours and keep contradictions uncertain; do not infer
   exact hours from a bound or range. Require a temporal unit so a range of houses is not a duration.
3. Filter incident type before SQL LIMIT 20 and recheck candidates before writing. Mock semantic
   matches stay tentative; contradictory durations cannot become HIGH associations.
4. Keep stored proposals/checkpoints compatible; do not recompute an existing proposal after a
   catalog change or overwrite historical explanations with unverified new provenance.
5. Reject length/refusal responses even with otherwise valid JSON; preserve provider isolation
   and avoid logging upstream messages. Discard model-supplied audit flags.
6. Keep approval gates, weights, solver, frontend and map worktree unchanged. The scheduled-state
   fix is in apply_decision, backed by a regression with an approved plan and a second report.
7. Close the two sqlite3 connections in the new populated-database migration test explicitly:
   a connection context manager commits/rolls back but does not close its handle.

No remaining must-fix finding in this diff after these corrections. Evals E55–64 cover numerical
integrity and intervals; provider, migration and recovery tests cover the remaining changes.
Full results and baseline are recorded in EVALUATION.md. Review of this patch by another team
member remains pending. Historical diagrams/results remain identifiable as earlier evidence.

Verdict: Ship for the documented local setup after applying the migration; UI adoption is pending.
Not checked: real NIM inference, frontend/browser, Linux/PostgreSQL, remote CI or sustained load.

### PR preparado (local; no se publicó)

**Título:** fix: preservar duración y explicar prioridades con datos reproducibles (AG-41).

**Problema y comportamiento resultante:** un intervalo se convertía en horas representativas,
y el modelo podía relatar puntos como horas/personas/porcentajes. El backend ahora acepta un
bucket durable, conserva inputs por propuesta y usa una explicación determinista. Aprobar un
duplicado ya no reabre un incidente SCHEDULED.

**Requisitos:** RF34, RF35 y RNF10; tarea AG-41 local, sin Issue remoto.

**Validación:** pytest completo y evals reales, Ruff/mypy y migraciones vacías/con datos; casos
negativos de contratos y proveedor, hash anterior y replay. Detalle en EVALUATION.md.

**Contratos y datos:** duration_bucket opcional, priority.inputs opcional y report administrativo;
migración e7a4c2d9b610 aditiva, campos nuevos con defaults para checkpoints antiguos. Método
interno explain_priority_proposal retirado. Tipos/fixtures TS deben adoptar el contrato en una
entrega posterior; se documenta la excepción al cambio conjunto porque frontend está fuera de
alcance por instrucción explícita. No se recategorizan reportes antiguos ni se alteran aprobaciones.

**Checklist:** diff/alcance, validación pertinente, documentos/bitácora y autorización protegida
revisados localmente. Simulación y límites explícitos. Revisión por otro integrante pendiente.

---

What this change does: AguaIA accepts water reports into a durable queue, runs three agents and
stores a priority proposal. A protected human review resumes LangGraph and records the final decision.

Review scope: all local changes, API callers, React views, graph nodes, database writes, migration,
provider adapter, tests and README. Expected load: a local hackathon demo with one worker on one host.

Looks good. Ship as a local demo within the documented limits.

Corrections made after the first review:

1. **Agents contained ORM writes.** Moved these writes into the finite `AgentTools` boundary.
   The consolidation tool checks real candidates again before writing; tests reject wrong sectors/types.
2. **The initial Vitest dependency tree had security advisories.** Updated to 5.0.5, reran tests/build,
   and the installation audit reports zero vulnerabilities. No forced bulk dependency upgrade was used.
3. **Configuration allowed the same file for business data and checkpoints.** The configuration now
   rejects that case before opening either store; a regression test covers it.
4. **Public execution responses had no explicit response schema.** Added `ExecutionReceipt` to the
   API contract. HTTP tests verify its states and that public responses exclude administrative data.
5. **A terminal business status could precede the final graph checkpoint.** A process death in that
   gap could leave an unfinished graph hidden behind APPROVED. Only the worker now publishes terminal
   status after the graph checkpoint; a test recovers after the decision commit and verifies one audit event.

Checks: transactional acceptance and review, replay idempotency, concurrent review conflicts,
worker process restart, candidate validation, priority rules, token handling, negative API/provider
tests, migration reversibility, frontend interactions, lint/types/build and preservation of README data.

No unnecessary plugin registry, general repository wrapper, message broker, routing solver or cloud
deployment was added. `AgentTools` exists for a concrete security boundary; it is not a generic CRUD layer.

Verdict: Ship for the local demo.
Not checked: live NVIDIA inference, PostgreSQL/Linux execution, a real browser accessibility audit,
remote CI, sustained load or public deployment. Shared tokens and a single worker remain MVP limits.

Files observed late in the workspace: `backend/config.py`, `backend/contracts.py`,
`backend/domain/priority.py` and their package markers were absent from the initial listing and
were not created by this implementation. Their origin is unconfirmed. They were preserved unchanged;
the tested runtime imports `backend/app` as package `app`. The alternative modules have different
contracts and priority thresholds and must not be mixed into this runtime without reconciliation.
