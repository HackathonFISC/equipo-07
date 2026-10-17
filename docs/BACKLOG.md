# Backlog preparado para GitHub Issues

## AG-52 · Integración AguaIA y Coordinación (RF40, RNF11)

Frontend y pruebas, P0; rama `integracion-aguaia`. Contrato acordado: consumir los campos
aditivos reales de AG-41, sin modificar Pydantic, políticas HITL, agentes, pesos ni solver.
Consumidores: CitizenPage, types, lookups, ReportsPanel, CoordinationPage, componentes de
prioridad, proxy Vite, fixtures y pruebas. Aceptación: enviar cada intervalo/null sin horas
representativas; idempotencia conservada; duración visible aun sin incidente; instantánea
separada del catálogo actual; rango sin promedio preseleccionado; decisión registrada/aplicada
distintas; Auditoría accesible desde navegación y reporte, con eventos reales y JSON; mapa,
flota y planes conservados; lint/tipos/Vitest/build, backend/migraciones y recorrido aislado
con mock. Sin tocar bases existentes ni acciones remotas/Git. Resultados al cerrar en UI.md.

Estado: completada localmente el 2026-10-17. Frontend: 30 Vitest, lint/tipos/build;
backend: 196 pytest, 88 % de cobertura, Ruff/formato/mypy; migraciones en bases temporales.
Chrome: ciclo ciudadano → LangGraph → revisión pendiente → worker → aplicada → plan/mapa/aviso.
Evidencia: `docs/evidence/ag52/README.md`. Revisión humana independiente pendiente.

## AG-41 · Integridad de los agentes (RF34, RF35, RNF10)

Backend y evals, P0. Criterios: reproducir 17–67 con población 2630; conservar intervalos
sin horas exactas; explicación sin inferencia numérica; instantánea reproducible y acceso
administrativo directo al reporte; candidatos compatibles y replay sin duplicar efectos;
pruebas y evals antes/después. Contratos aditivos: `duration_bucket` opcional en ReportInput,
`inputs` opcional en PriorityResult y `report` en detalle administrativo. Mantener payloads
anteriores, hash de idempotencia, checkpoints y propuestas históricas. Frontend no se edita;
su adopción del intervalo se documentará. Sin nuevos umbrales, agentes ni aprobación automática.

Actualizado el 2026-10-16 a partir de [GAP_ANALYSIS](GAP_ANALYSIS.md). **No se crearon Issues
remotos.** Cada bloque `AG-xx` puede copiarse como una Issue. El backlog anterior (B01–B13) se
conserva en el [Apéndice B](#apéndice-b--backlog-anterior-preservado), con su equivalencia.

## Convenciones

- **Esfuerzo:** XS ≤ 2 h · S ≈ medio día · M ≈ 1 día · L ≈ 2–3 días. Son estimaciones para dividir
  trabajo, no compromisos.
- **Roles** (áreas técnicas, no personas; la asignación se ajusta en [NEXT_STEPS](NEXT_STEPS.md)):
  - **A**: backend, datos y API (`api.py`, `services.py`, `models.py`, migraciones, dominio de planificación de datos);
  - **B**: agentes, IA y evals (`agents.py`, `graph.py`, `providers.py`, `worker.py`, solver, `evals/`);
  - **C**: frontend, UX y demo (`frontend/src`, accesibilidad, documentación de usuario, video).
- **Título en GitHub:** `AG-xx · <título>` (el número de Issue de GitHub será distinto).
- **Rama:** la sugerida usa el ID interno. Al crear la Issue, se puede usar `tipo/<n.º issue>-slug`
  según CONTRIBUTING.
- **Etiquetas** (CONTRIBUTING + nuevas): `backend`, `agents`, `frontend`, `docs`, `security`, `evals`,
  `bug`, `priority:P0|P1|P2`, `size:XS|S|M|L`, `contract-change`, `adr`, `blocked`,
  `needs-authorization`, `phase:0..6`.
- **Definition of Ready:** criterios verificables, dependencias integradas o sustituidas por fixtures
  de contrato, archivos afectados acordados.
- **Definition of Done:** la de CONTRIBUTING, más la actualización de `docs/REQUIREMENTS.md` y
  `docs/AI_LOG.md` cuando aplique.

## Contratos compartidos que deben acordarse antes de trabajar en paralelo

Cada contrato se integra en **un PR propio** antes de los PR que lo consumen. Los ejemplos son
**borradores para discusión, no implementados**. Los valores entre `<>` son marcadores, no datos.

| ID | Contrato | Issue | Consumidores | Responsable |
|---|---|---|---|---|
| C1 | Detalle y listado de ejecuciones para coordinación | AG-13 | AG-18, AG-19 | A (revisa C) |
| C2 | Prioridad vigente del incidente y cola priorizada | AG-14, AG-16 | AG-18, AG-29, AG-39 | A + B |
| C3 | Catálogo de códigos de error | AG-04 | AG-19, AG-26 | A |
| C4 | `ReviewInput` con semántica de intervalo | AG-15 | AG-19, AG-14 | B + equipo |
| C5 | Planificación: flota, depósitos, matriz, solicitud, resultado y revisión de plan | AG-29 | AG-30 a AG-36 | A + B (revisa C) |
| C6 | Ruta de revisión (`ReviewRoute`) | AG-39 | AG-40, AG-41 | B |
| C7 | Formato del corpus de evaluación LLM | AG-25 | AG-26, AG-27 | B |
| C8 | Glosario de la interfaz (enums → español) | AG-18 | Toda la UI | C (revisan A y B) |

<details><summary>C1 — Detalle de ejecución v2 (aditivo)</summary>

```json
{
  "id": "<uuid>", "status": "WAITING_APPROVAL", "provider": "mock-deterministic",
  "is_simulated": true, "error_code": null, "attempts": 1, "created_at": "<iso>",
  "report": { "description": "<texto ciudadano>", "hours_without_water": 24, "created_at": "<iso>" },
  "community": { "id": "arraijan-demo", "name": "Sector demostrativo de Arraiján",
                 "district": "Arraiján", "is_synthetic": true },
  "incident": { "id": "<uuid>", "kind": "OUTAGE", "status": "OPEN", "summary": "<texto>",
                "report_count": 2 },
  "proposal": { "...": "campos actuales",
                "inputs": { "hours": 24, "critical": null, "population": 1800, "vulnerability": 0.7 } },
  "association": { "...": "campos actuales", "candidate_summary": "<texto o null>" },
  "review": { "...": "campos actuales" },
  "traces": [ "...sin cambios..." ]
}
```
</details>

<details><summary>C2 — Elemento de la cola de incidentes</summary>

```json
{
  "id": "<uuid>", "kind": "OUTAGE", "status": "PRIORITIZED", "last_activity": "<iso>",
  "community": { "id": "<slug>", "name": "<nombre>", "district": "<distrito>", "is_synthetic": true },
  "current_priority": { "score": 62, "score_min": 45, "score_max": 75, "policy_version": "v1.0.0-demo",
                        "approved_at": "<iso>", "source_execution_id": "<uuid>" },
  "immediate_review": false, "pending_reviews": 1, "report_count": 3
}
```
</details>

<details><summary>C3 — Códigos de error</summary>

`PROVIDER_TIMEOUT`, `PROVIDER_HTTP_ERROR`, `PROVIDER_INVALID_OUTPUT`, `INVALID_DUPLICATE_CANDIDATE`,
`INCOMPATIBLE_INCIDENT_TYPE`, `PROVIDER_CONFIGURATION_CHANGED`, `INTERNAL_ERROR`.
`UNGROUNDED_HOURS` y `UNGROUNDED_CRITICAL_INSTITUTION` dejan de ser errores tras AG-01 y AG-02.
</details>

<details><summary>C5 — Planificación (borrador para ADR-004)</summary>

```json
{
  "tanker": { "id": "<slug>", "label": "Cisterna demostrativa 1", "capacity_liters": "<entero > 0, ficticio>",
              "depot_id": "<slug>", "shift_start": "<HH:MM>", "shift_end": "<HH:MM>",
              "max_route_minutes": "<entero, proxy de combustible>", "status": "AVAILABLE",
              "source": "SYNTHETIC" },
  "depot": { "id": "<slug>", "name": "Punto de llenado demostrativo", "supply_liters_per_day": "<entero>",
             "source": "SYNTHETIC" },
  "travel_time": { "depot_id": "<slug>", "community_id": "<slug>", "minutes_one_way": "<entero>",
                   "source": "SYNTHETIC|MANUAL|VERIFIED" },
  "plan_request": { "tanker_ids": ["<slug>"], "depot_ids": ["<slug>"], "policy_version": "dist-v0.1.0-demo" },
  "plan_result": {
    "plan_id": "<uuid>", "status": "WAITING_APPROVAL", "solver_status": "OPTIMAL|FEASIBLE|INFEASIBLE",
    "policy_version": "dist-v0.1.0-demo", "input_hash": "<sha256>", "is_synthetic": true,
    "trips": [{ "tanker_id": "<slug>", "sequence": 1, "community_id": "<slug>", "liters": 0, "est_minutes": 0 }],
    "coverage": [{ "community_id": "<slug>", "priority": 0, "demand_liters": 0,
                   "planned_liters": 0, "unmet_liters": 0 }],
    "kpis": { "weighted_coverage": 0.0, "total_minutes": 0 },
    "warnings": ["DATOS_SINTETICOS", "MATRIZ_MANUAL"], "infeasibility": null, "explanation": "<texto verificado>"
  },
  "plan_review": { "decision": "APPROVE|REJECT|REQUEST_CHANGES", "reason": "<≥5 caracteres>" }
}
```
</details>

<details><summary>C6, C7, C8</summary>

- **C6:** `{ "route": "AUTO|HUMAN", "reasons": ["R1_INSTITUCION_CRITICA"], "policy_version": "review-v1.0.0", "mode": "all_human|exceptions" }`
- **C7** (JSONL): `{ "id", "task": "extract|dedupe|explain", "input": {...}, "expected": {...}, "annotators": ["A","B"], "agreement": true, "notes": "" }`
- **C8:**

  | Grupo | Valores |
  |---|---|
  | Tipo | `OUTAGE` → «Sin servicio» · `LOW_PRESSURE` → «Baja presión» · `LEAK` → «Fuga» · `UNKNOWN` → «Sin clasificar» |
  | Asociación | `CONFIRMED` → «Agrupado» · `PENDING_REVIEW` → «Agrupación por confirmar» · `REJECTED` → «Descartado» |
  | Confianza | `HIGH` → «Datos completos» · `MEDIUM` → «Faltan 1–2 datos» · `LOW` → «Faltan 3 o más datos» |
  | Banderas | `DATOS_INCOMPLETOS` → «Faltan datos» · `DATOS_SECTOR_SINTETICOS` → «Datos del sector ficticios» · `CONTRADICCION_DURACION` → «Duraciones contradictorias» |

  Las bandas de prioridad (Alta/Media/Baja) son **solo de presentación** y se documentan; no cambian
  ninguna decisión.
</details>

## Reglas para minimizar conflictos

1. **Contrato primero:** C1 y C2 se integran antes de AG-18; C5 antes de AG-30 a AG-35.
   Mientras tanto, el frontend trabaja con fixtures tipadas del contrato.
2. **Migraciones:** solo una PR con migración abierta a la vez. Antes de integrar, rebase y ajustar
   `down_revision`; CI exige un único head (AG-07). Responsable habitual: rol A.
3. **Archivos compartidos con responsable:**

   | Archivos | Responsable |
   |---|---|
   | `contracts.py`, `models.py`, `migrations/` | A |
   | `agents.py`, `graph.py`, `providers.py`, `worker.py` | B |
   | `frontend/src/**` | C |
   | `types.ts` | C, a partir del PR de contrato de A |

   Quien necesite tocar un archivo ajeno lo avisa en la Issue.
4. **Docs centrales:** README, REQUIREMENTS, EVALUATION y AI_LOG solo se editan en el PR de la
   funcionalidad, en secciones propias. Si hay conflicto, se resuelve leyendo ambas versiones.
5. **Resultados generados:** no versionar `evals/results.*` en PR normales (AG-06).

---

## Fase 0 — Estabilización y contratos

### AG-01 · Detectar institución crítica aunque la frase contenga «no»
- **Prioridad · esfuerzo · rol:** P0 · S · B — `agents`, `bug`, `phase:0`
- **Rama:** `fix/AG-01-institucion-critica`
- **Descripción:** reescribir la detección para que la negación solo invalide cuando niega a la
  institución («ningún hospital afectado», «sin afectar a la escuela») y no cuando niega el agua.
  Mover `critical_evidence` y `stated_hours` de `providers.py` a un módulo puro `app/grounding.py`.
  Si el LLM afirma una institución crítica sin evidencia, **descartar el valor y añadir la bandera
  `INSTITUCION_NO_VERIFICADA`** en lugar de lanzar `ProviderError`.
- **Justificación:** D-01. 4 de 5 frases realistas fallan (`providers.py:46`); con NIM, la ejecución
  termina en ERROR (`agents.py:27-28`). Afecta 30 puntos y la alerta inmediata.
- **Módulos:** `backend/app/providers.py`, `app/agents.py`, nuevo `app/grounding.py`, tests, `evals/cases.json`.
- **Dependencias:** ninguna. AG-02 toca el mismo módulo: mismo responsable o PR secuenciales.
- **Criterios de aceptación:**
  - [ ] Tabla de ≥ 12 frases:
    - positivas: «En el hospital no hay agua», «La escuela no tiene agua», «No llega el agua a la policlínica», «Centro de salud sin agua»;
    - negativas: «No hay ningún hospital afectado», «sin afectar a la escuela»;
    - ambiguas → `None`.
  - [ ] LLM `True` sin evidencia → `critical_institution=None`, bandera, y la ejecución llega a WAITING_APPROVAL.
  - [ ] E08 sigue pasando; nueva eval E23 «hospital con negación del agua».
  - [ ] `providers.py` ya no contiene reglas de dominio.
- **Pruebas:** unitarias parametrizadas, eval nueva, suite completa.
- **Riesgos de integración:** cambia resultados de ejemplos de demo (revisar DEMO.md). La regex sigue
  siendo una primera barrera; llevar las frases al corpus de AG-25.

### AG-02 · Fundamentar duraciones en días, semanas y abreviaturas sin convertirlas en ERROR
- **Prioridad · esfuerzo · rol:** P0 · S · B — `agents`, `bug`, `phase:0`
- **Rama:** `fix/AG-02-fundamentacion-duracion`
- **Descripción:**
  - reconocer «N días» (×24), «N semanas» (×168), «24h/24 hrs» y fracciones («1 hora y media»);
  - expresiones imprecisas («desde ayer») → `None` con bandera `DURACION_IMPRECISA`;
  - si el LLM propone horas no fundamentadas → `None` con bandera `DURACION_NO_VERIFICADA`, sin ERROR;
  - se mantiene la contradicción texto/formulario.
- **Justificación:** D-02. Hoy «2 días» extraído correctamente por NIM produce ERROR, y el reintento es determinístico.
- **Módulos:** `app/grounding.py`, `app/agents.py`, tests, `evals/cases.json`, `docs/GUARDRAILS.md`.
- **Dependencias:** AG-01 (mismo módulo).
- **Criterios de aceptación:**
  - [ ] «2 días» → 48; «una semana» → 168; «24h» → 24; «1 hora y media» → 1.5; «desde ayer» → `None` con bandera.
  - [ ] Valor no fundamentado → ejecución en WAITING_APPROVAL con bandera.
  - [ ] E21 se actualiza de «ERROR» a «bandera». El cambio queda documentado en GUARDRAILS y EVALUATION.
  - [ ] Sigue apareciendo `CONTRADICCION_DURACION` cuando corresponde.
- **Pruebas:** tabla de ≥ 15 frases; E21; suite completa.
- **Riesgos de integración:** cambio de comportamiento de una eval existente; acordarlo en la revisión.

### AG-03 · No consultar al LLM de deduplicación sin candidatos compatibles
- **Prioridad · esfuerzo · rol:** P1 · XS · B — `agents`, `phase:0`
- **Rama:** `perf/AG-03-dedupe-sin-candidatos`
- **Descripción:** en `Agents.verify` (`agents.py:50-64`), si no hay candidatos o ninguno es del
  mismo tipo, emitir LOW determinístico («Sin candidatos compatibles en la ventana») sin llamar
  al proveedor.
- **Justificación:** D-05. 4.9 s de llamada real sin candidatos; elimina la posibilidad de un UUID inventado.
- **Módulos:** `app/agents.py`, tests.
- **Dependencias:** ninguna.
- **Criterios de aceptación:**
  - [ ] Un proveedor espía no recibe llamadas con 0 candidatos ni con solo tipos distintos.
  - [ ] E07 y E22 pasan.
  - [ ] La traza indica regla determinística.
- **Pruebas:** unitaria con espía; suite completa.
- **Riesgos de integración:** ninguno: el mock ya devolvía LOW.

### AG-04 · Persistir códigos de error controlados
- **Prioridad · esfuerzo · rol:** P1 · S · A — `backend`, `contract-change`, `phase:0`
- **Rama:** `feat/AG-04-codigos-error`
- **Descripción:** catálogo C3 en un módulo `app/errors.py`. El worker traduce la excepción a un código:
  - `ProviderError` → su código controlado;
  - errores de transporte → `PROVIDER_*`;
  - el resto → `INTERNAL_ERROR`.

  Nunca se guardan mensajes upstream. Se expone `error_code` en el detalle (C1).
- **Justificación:** D-06. Hoy solo se guarda `ProviderError` (`worker.py:89`).
- **Módulos:** `app/worker.py`, nuevo `app/errors.py`, `contracts.py`, `frontend/src/types.ts`.
- **Dependencias:** ninguna. Coordinar el campo con AG-13.
- **Criterios de aceptación:**
  - [ ] Todo `error` persistido pertenece al catálogo.
  - [ ] Pruebas para timeout, HTTP 500, salida inválida y candidato inválido.
  - [ ] Ningún mensaje upstream persistido.
- **Pruebas:** E13, E20 y E21 verifican el código; prueba de no filtrado.
- **Riesgos de integración:** sin migración (`String(120)` basta). Evitar editar `providers.py` (rol B).

### AG-05 · Vocabulario panameño en el filtro temático y sinónimos del mock
- **Prioridad · esfuerzo · rol:** P1 · S · B — `agents`, `bug`, `phase:0`
- **Rama:** `fix/AG-05-vocabulario-local`
- **Descripción:** ampliar el filtro de `contracts.py:56` con «pluma», «cisterna», «carro cisterna»,
  «IDAAN», «tanque», «potable» y «servicio de agua». Añadir sinónimos al mock: «no sale agua» y
  «pluma seca» → OUTAGE.
- **Justificación:** D-03, D-18. «La pluma está seca» recibe hoy 422.
- **Módulos:** `app/contracts.py`, `app/providers.py` (mock), tests.
- **Dependencias:** ninguna.
- **Fuera de alcance:** nuevos tipos de incidente (AG-52).
- **Criterios de aceptación:**
  - [ ] ≥ 15 frases locales aceptadas.
  - [ ] ≥ 8 frases fuera de tema siguen rechazadas.
  - [ ] E11 y E12 intactas.
- **Pruebas:** tablas positiva y negativa.
- **Riesgos de integración:** un filtro más amplio deja pasar más ruido; la tabla negativa lo controla.

### AG-06 · Cobertura fiable y resultados de evals sin conflictos
- **Prioridad · esfuerzo · rol:** P1 · XS · A — `backend`, `evals`, `phase:0`
- **Rama:** `chore/AG-06-cobertura-resultados`
- **Descripción:**
  - `[tool.coverage.run] concurrency = ["greenlet", "thread"]` y `fail_under` acordado tras medir;
  - `scripts/evaluate.py` escribe por defecto en una ruta ignorada y solo actualiza
    `evals/results.json/xml` con `--write-evidence` (PR de evidencia);
  - CI sube los resultados como artefacto.
- **Justificación:** D-12 (86 % frente a 93 % reales), D-20 (timestamp versionado = conflictos seguros).
- **Módulos:** `backend/pyproject.toml`, `scripts/evaluate.py`, `.gitignore`, `.github/workflows/ci.yml`, `docs/EVALUATION.md`.
- **Dependencias:** ninguna.
- **Criterios de aceptación:**
  - [ ] Cobertura local ≥ 92 %.
  - [ ] Ejecutar el runner no modifica archivos versionados sin la bandera.
  - [ ] El artefacto aparece en CI.
- **Pruebas:** ejecución local y en CI.
- **Riesgos de integración:** los otros PR deben rebasar para dejar de tocar `results.*`.

### AG-07 · Preparar Alembic para migraciones paralelas en SQLite
- **Prioridad · esfuerzo · rol:** P0 · XS · A — `backend`, `phase:0`
- **Rama:** `chore/AG-07-alembic-batch`
- **Descripción:** `render_as_batch=True` en `migrations/env.py` (online y offline); paso de CI que
  falla si `alembic heads` devuelve más de un head; regla de rebase de `down_revision` en CONTRIBUTING.
- **Justificación:** GAP QS-06 y R6. Las fases 1 y 3 añaden migraciones.
- **Módulos:** `backend/migrations/env.py`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`.
- **Dependencias:** ninguna. **Bloquea** AG-14 y AG-30.
- **Criterios de aceptación:**
  - [ ] `alembic check` limpio y `test_migrations` verde.
  - [ ] Dos heads en una rama desechable → CI rojo.
- **Pruebas:** `test_migrations.py`; comprobación manual de heads.
- **Riesgos de integración:** ninguno sobre los datos existentes.

### AG-08 · Resolver módulos huérfanos fuera de `app/`
- **Prioridad · esfuerzo · rol:** P1 · XS · A — `backend`, `phase:0`
- **Rama:** `chore/AG-08-modulos-huerfanos`
- **Descripción:** confirmar con el equipo el origen de `backend/config.py`, `backend/contracts.py`,
  `backend/domain/` y `backend/__init__.py` (ver REVIEW.md). Si nadie los reclama, eliminarlos.
  Registrar ideas útiles, como las correcciones por factor de `ReviewInput.corrections`, en AG-15.
- **Justificación:** D-13. Contratos y umbrales divergentes confunden a quien empieza.
- **Módulos:** los archivos citados.
- **Dependencias:** confirmación del equipo (regla AGENTS.md: no sobrescribir trabajo ajeno).
- **Criterios de aceptación:**
  - [ ] Decisión registrada en el PR.
  - [ ] `rg` sin imports.
  - [ ] Suite verde.
- **Pruebas:** suite completa.
- **Riesgos de integración:** borrar trabajo de alguien. Confirmar primero.

### AG-09 · Rutas de configuración independientes del directorio y sin efectos al importar
- **Prioridad · esfuerzo · rol:** P2 · S · A — `backend`, `phase:0`
- **Rama:** `refactor/AG-09-rutas-config`
- **Descripción:** resolver `env_file` y las rutas SQLite relativas a la raíz del repositorio
  (`Path(__file__)`) y no al directorio actual (`config.py:9`). Evitar `app = create_app()` al importar
  (`api.py:184`) usando la fábrica de uvicorn.
- **Justificación:** D-15, D-16.
- **Módulos:** `app/config.py`, `app/api.py`, `tests/test_process_e2e.py`, README, DEMO.
- **Dependencias:** ninguna.
- **Criterios de aceptación:**
  - [ ] La misma `.env` se lee desde la raíz y desde `backend`.
  - [ ] Importar `app.api` no crea directorios.
  - [ ] Comandos documentados actualizados y probados.
- **Pruebas:** e2e y migraciones.
- **Riesgos de integración:** cambian los comandos de arranque documentados; avisar a todo el equipo.

### AG-10 · Verificar CI remoto, evitar ejecuciones duplicadas y proteger `main`
- **Prioridad · esfuerzo · rol:** P0 · S · A + administrador del repo — `backend`, `needs-authorization`, `phase:0`
- **Rama:** `ci/AG-10-ci-remoto`
- **Descripción:** revisar la pestaña Actions. Limitar `push` a `main` y mantener `pull_request`.
  Configurar protección de `main`: PR obligatorio, 1 revisión y checks `backend (ubuntu, windows)` y
  `frontend` requeridos.
- **Justificación:** QS-08, D-24, B04.
- **Módulos:** `.github/workflows/ci.yml`, configuración del repositorio.
- **Dependencias:** autorización explícita para acciones remotas.
- **Criterios de aceptación:**
  - [ ] Último run verde en ambos sistemas operativos.
  - [ ] Un PR de prueba muestra los checks requeridos.
  - [ ] Sin ejecuciones duplicadas.
  - [ ] DELIVERY_CHECKLIST enlaza el run.
- **Pruebas:** el propio CI.
- **Riesgos de integración:** prueba e2e de procesos inestable en Windows; OR-Tools añadirá tiempo de instalación.

### AG-11 · Pruebas en proceso de listados admin, `health` y `communities`
- **Prioridad · esfuerzo · rol:** P2 · XS · A — `backend`, `phase:0`
- **Rama:** `test/AG-11-api-listados`
- **Descripción:** cubrir `api.py:89-91, 99-100, 131-132, 146-147`: respuesta 200 con token, forma de
  la respuesta, paginación y modo en `health`.
- **Justificación:** D-21.
- **Módulos:** `backend/tests/`.
- **Dependencias:** ninguna; se beneficia de AG-13.
- **Criterios de aceptación:**
  - [ ] Cobertura de `api.py` ≥ 95 %.
  - [ ] Paginación probada.
- **Pruebas:** nuevas pruebas httpx.
- **Riesgos de integración:** ninguno.

### AG-12 · Corregir inconsistencias documentales
- **Prioridad · esfuerzo · rol:** P1 · XS · C — `docs`, `phase:0`
- **Rama:** `docs/AG-12-consistencia`
- **Descripción:**
  - aclarar que `moonshotai/kimi-k3` **no se invocó** (se probó Kimi K2.6);
  - registrar la segunda ejecución NIM (`f2c78ad0`) sin datos sensibles;
  - anotar la cobertura real (93 % con greenlet);
  - enlazar GAP_ANALYSIS, ROADMAP y NEXT_STEPS desde README;
  - reubicar FUT01 en la Fase 3.
- **Justificación:** D-22. Afirmaciones precisas ante el jurado.
- **Módulos:** `README.md`, `docs/NVIDIA_SMOKE.md`, `docs/EVALUATION.md`, `docs/REQUIREMENTS.md`.
- **Dependencias:** ninguna.
- **Criterios de aceptación:**
  - [ ] Ninguna afirmación sin evidencia.
  - [ ] Revisado por otro integrante.
- **Pruebas:** revisión cruzada.
- **Riesgos de integración:** conflictos en README. Avisar antes de editar.

### AG-13 · [Contrato C1] Detalle de ejecución con evidencia para coordinación
- **Prioridad · esfuerzo · rol:** P0 · S · A (revisa C) — `backend`, `frontend`, `contract-change`, `phase:0`
- **Rama:** `feat/AG-13-contrato-detalle`
- **Descripción:** extender `GET /api/admin/executions/{id}` según C1: `report`, `community`,
  `incident`, `proposal.inputs`, `association.candidate_summary` y `error_code`. Añadir `response_model`
  Pydantic para el detalle y los listados admin. Sincronizar `types.ts`. El cambio es aditivo.
- **Justificación:** D-07. Hoy se revisa sin ver el reporte. También QS-09 (OpenAPI incompleto).
- **Módulos:** `contracts.py`, `services.py` (`execution_detail`), `api.py`, `frontend/src/types.ts`, tests.
- **Dependencias:** ninguna. **Primer PR de contrato.**
- **Criterios de aceptación:**
  - [ ] OpenAPI describe detalle y listados.
  - [ ] Una prueba de contrato fija las claves.
  - [ ] `/api/executions/{id}` público sigue sin texto.
  - [ ] Cambio mínimo de UI que muestra texto del reporte y comunidad.
- **Pruebas:** httpx (contrato y privacidad del endpoint público); Vitest de render.
- **Riesgos de integración:** base de AG-18 y AG-19, así que debe integrarse primero.

### AG-14 · [Contrato C2 + ADR-002] Prioridad vigente por incidente y ciclo de vida
- **Prioridad · esfuerzo · rol:** P0 · M · A (codiseño con B) — `backend`, `adr`, `contract-change`, `phase:0`
- **Rama:** `feat/AG-14-prioridad-incidente`
- **Descripción:** redactar ADR-002 que decida:
  1. la prioridad vigente es la última revisión humana aplicada (APPROVE/CORRECT) de cualquier
     reporte del incidente;
  2. las nuevas propuestas agregan evidencia: horas = máximo declarado entre reportes confirmados;
     institución crítica = OR; población y vulnerabilidad del catálogo, **nunca el número de reportes**;
  3. estados `OPEN → PRIORITIZED → IN_ATTENTION → RESOLVED | CLOSED_NO_ACTION`, con transiciones válidas;
  4. un incidente `RESOLVED` deja de ser candidato;
  5. auditoría a nivel de incidente (`traces.execution_id` es obligatorio hoy).

  Implementar la migración (columnas denormalizadas actualizadas en `apply_decision` y backfill) y
  los servicios.
- **Justificación:** D-09, D-10. Prerrequisito de las fases 3 y 4.
- **Módulos:** `docs/adr/002-*.md`, `models.py`, migración, `services.py`, `contracts.py`, tests.
- **Dependencias:** AG-07.
- **Criterios de aceptación:**
  - [ ] ADR aprobado por los tres.
  - [ ] Migración reversible y `alembic check` limpio.
  - [ ] Aprobar un segundo reporte actualiza la prioridad vigente de forma determinística y auditada.
  - [ ] `RESOLVED` no recibe consolidaciones.
  - [ ] Pruebas de replay e idempotencia.
- **Pruebas:** resiliencia (reinicio entre commit y checkpoint), unitarias de agregación y migración.
- **Riesgos de integración:** toca `apply_decision`, camino crítico del HITL. La topología del grafo no cambia.

### AG-15 · [ADR-003, contrato C4] Semántica de aprobación con intervalo
- **Prioridad · esfuerzo · rol:** P0 · S · B + todo el equipo — `agents`, `adr`, `contract-change`, `phase:0`
- **Rama:** `docs/AG-15-adr-aprobacion` (ADR) y `feat/AG-15-aprobacion-intervalo` (implementación)
- **Descripción:**
  - **opción recomendada:** si `score_min == score_max`, APPROVE fija ese valor. Si hay intervalo,
    APPROVE exige `approved_score` ∈ [min, max] elegido explícitamente; la UI no preselecciona. Fuera
    del rango se usa CORRECT;
  - **alternativa:** guardar el intervalo aprobado y que el planificador aplique una política explícita.
- **Justificación:** D-08. `services.py:200-206` aplica la penalización que D5 excluyó.
- **Módulos:** `docs/adr/003-*.md`, `contracts.py` (`ReviewInput`), `services.py`, `CoordinationPage.tsx`,
  `test_evaluations.py` (E14, E15, E19), `test_process_e2e.py`, `DEMO.md`.
- **Dependencias:** el ADR no tiene dependencias; la implementación va después de AG-13.
- **Criterios de aceptación:**
  - [ ] ADR aprobado.
  - [ ] APPROVE sin valor con intervalo → 422 explicativo.
  - [ ] e2e actualizado.
  - [ ] La UI muestra el rango y qué dato falta.
- **Pruebas:** evals de decisión humana; prueba e2e.
- **Riesgos de integración:** cambia el guion de la demo y una aserción e2e. Coordinar con C.

---

## Fase 1 — Incidente como unidad operativa

### AG-16 · API de cola priorizada de incidentes
- **Prioridad · esfuerzo · rol:** P0 · M · A — `backend`, `phase:1`
- **Rama:** `feat/AG-16-cola-priorizada`
- **Descripción:** `GET /api/admin/incidents?status=&order=priority` con `response_model` C2.
  Orden determinístico documentado:
  1. `immediate_review` descendente;
  2. revisiones pendientes con `score_max` descendente;
  3. prioridad vigente descendente;
  4. última actividad más antigua primero;
  5. `id`.
- **Justificación:** D-11. Sin cola, la prioridad no se traduce en un orden de atención.
- **Módulos:** `api.py`, `services.py`, `contracts.py`, tests.
- **Dependencias:** AG-14.
- **Criterios de aceptación:**
  - [ ] Orden probado con ≥ 6 incidentes, incluidos empates.
  - [ ] Paginación.
  - [ ] Endpoint protegido.
  - [ ] Agregaciones en SQL, sin N+1.
- **Pruebas:** httpx con datos sembrados.
- **Riesgos de integración:** contrato consumido por AG-18.

### AG-17 · Atender, resolver o cerrar incidentes
- **Prioridad · esfuerzo · rol:** P1 · S · A — `backend`, `phase:1`
- **Rama:** `feat/AG-17-ciclo-incidente`
- **Descripción:** `POST /api/admin/incidents/{id}/status {status, reason}` con compare-and-set de la
  transición y auditoría a nivel de incidente (según ADR-002).
- **Justificación:** D-10.
- **Módulos:** `api.py`, `services.py`, `contracts.py`, tests.
- **Dependencias:** AG-14.
- **Criterios de aceptación:**
  - [ ] Transición inválida → 409.
  - [ ] Razón obligatoria.
  - [ ] Evento auditado.
  - [ ] `RESOLVED` excluido de los candidatos.
- **Pruebas:** transiciones, concurrencia, dedupe tras el cierre.
- **Riesgos de integración:** migración de auditoría coordinada con AG-14.

### AG-18 · Bandeja priorizada y detalle legible
- **Prioridad · esfuerzo · rol:** P0 · M · C — `frontend`, `phase:1`
- **Rama:** `feat/AG-18-bandeja-coordinacion`
- **Descripción:**
  - la bandeja de incidentes (AG-16) más «Pendientes de revisión» sustituye la lista de ejecuciones;
  - glosario C8 centralizado en `labels.ts`;
  - paginación independiente (D-14);
  - detalle con el texto del reporte y la comunidad (AG-13);
  - UUID solo en el panel técnico.
- **Justificación:** D-07, D-11, D-14; GAP §9.
- **Módulos:** `frontend/src/pages/CoordinationPage.tsx`, nuevos componentes, `labels.ts`, `types.ts`, tests.
- **Dependencias:** AG-13 y AG-16 (puede empezar con fixtures del contrato).
- **Criterios de aceptación:**
  - [ ] Ningún UUID ni enum en inglés visible fuera del panel técnico.
  - [ ] Orden idéntico al de la API.
  - [ ] Estados de carga, vacío y error.
  - [ ] Usable a 375 px.
- **Pruebas:** Vitest para orden, glosario y paginación independiente.
- **Riesgos de integración:** contrato en curso; usar fixtures tipadas.

### AG-19 · Revisión en lenguaje operativo y panel técnico plegable
- **Prioridad · esfuerzo · rol:** P1 · M · C — `frontend`, `phase:1`
- **Rama:** `feat/AG-19-revision-operativa`
- **Descripción:**
  - factores con el dato de entrada: «Duración declarada: 24 h → 26 de 35 puntos», «Población: desconocida → entre 0 y 15»;
  - explicación del rango;
  - decisión según ADR-003, con confirmación que resume el efecto;
  - resolución de asociación mostrando el incidente candidato;
  - línea de tiempo legible: Recibido → Analizado → Agrupado → Propuesta → Decisión;
  - errores con etiqueta (AG-04);
  - proveedor, ID y JSON en «Detalles técnicos».
- **Justificación:** GAP §9; OF-04 y OF-05.
- **Módulos:** `frontend/src`.
- **Dependencias:** AG-13, AG-15; AG-04 opcional.
- **Criterios de aceptación:**
  - [ ] Prueba con una persona no técnica, con observaciones registradas en el PR.
  - [ ] Vitest para APPROVE con intervalo, CORRECT, asociación y ERROR con reintento.
- **Pruebas:** Vitest; recorrido manual.
- **Riesgos de integración:** depende del ADR-003.

### AG-20 · Consulta ciudadana del estado
- **Prioridad · esfuerzo · rol:** P2 · S · C — `frontend`, `phase:1`
- **Rama:** `feat/AG-20-consulta-ciudadana`
- **Descripción:** página pública que consulta el UUID completo (botón copiar) y muestra solo estados
  públicos en lenguaje llano. **No aceptar prefijos**, para impedir la enumeración.
- **Justificación:** D-17.
- **Módulos:** `frontend/src`.
- **Dependencias:** ninguna.
- **Criterios de aceptación:**
  - [ ] Solo datos públicos.
  - [ ] Errores claros.
  - [ ] Accesible.
- **Pruebas:** Vitest.
- **Riesgos de integración:** ninguno.

### AG-21 · Explicación fiel a los factores determinísticos
- **Prioridad · esfuerzo · rol:** P1 · S · B — `agents`, `bug`, `phase:1`
- **Rama:** `fix/AG-21-explicacion-fiel`
- **Descripción:** enviar al LLM factores etiquetados (nombre, dato de entrada, unidad, puntos, máximo,
  desconocido). Verificar después que cada número citado pertenezca al conjunto permitido y que no
  aparezcan términos prohibidos («despachó»). Si falla, usar la explicación de plantilla determinística
  con la bandera `EXPLICACION_PLANTILLA`, sin ERROR. El mock usa la misma plantilla.
- **Justificación:** D-04: el modelo real confundió puntos con horas.
- **Módulos:** `app/agents.py`, `app/providers.py`, `app/grounding.py`, tests.
- **Dependencias:** AG-13 (entradas), AG-01.
- **Criterios de aceptación:**
  - [ ] El texto real registrado en GAP §5 (D-04) es rechazado por el verificador.
  - [ ] La plantilla es legible.
- **Pruebas:** transporte simulado con salidas fieles e infieles.
- **Riesgos de integración:** falsos rechazos de números escritos con letras; se usa la plantilla.

### AG-22 · Auditoría de accesibilidad y correcciones
- **Prioridad · esfuerzo · rol:** P1 · S · C — `frontend`, `phase:1`
- **Rama:** `a11y/AG-22-auditoria`
- **Descripción:**
  - axe en pruebas;
  - recorrido con teclado y NVDA;
  - contraste y tamaño mínimo de 12 px;
  - `aria-current` en la navegación;
  - foco tras enviar el reporte y tras decidir;
  - anuncios `aria-live` de cambios de estado.
- **Justificación:** B03; QS-12.
- **Módulos:** `frontend/src`, `package.json` (dependencia de desarrollo).
- **Dependencias:** idealmente después de AG-18.
- **Criterios de aceptación:**
  - [ ] 0 violaciones serias de axe.
  - [ ] Informe manual en `docs/`.
- **Pruebas:** axe en Vitest.
- **Riesgos de integración:** cambio de lockfile npm.

---

## Fase 2 — Evaluación real NVIDIA (pista paralela)

### AG-23 · Telemetría por llamada LLM
- **Prioridad · esfuerzo · rol:** P1 · S · B — `agents`, `evals`, `phase:2`
- **Rama:** `feat/AG-23-telemetria-llm`
- **Descripción:** evento técnico `LLM_CALL` por llamada con tarea, modelo, latencia, intentos,
  `finish_reason`, tokens (`usage`) y resultado. **Sin prompt ni contenido.** El proveedor no accede
  a la DB: devuelve metadatos o recibe un registrador inyectado.
- **Justificación:** GAP §6.1; AI-07.
- **Módulos:** `app/providers.py`, `app/agents.py`, `app/services.py`.
- **Dependencias:** ninguna.
- **Criterios de aceptación:**
  - [ ] Una prueba confirma que el texto ciudadano no aparece en las trazas.
  - [ ] El mock también emite el evento.
- **Pruebas:** transporte simulado.
- **Riesgos de integración:** respetar el límite de AGENTS.md (`providers.py` sin DB).

### AG-24 · Reintento acotado ante salida inválida y extracción tolerante (D6)
- **Prioridad · esfuerzo · rol:** P1 · S · B — `agents`, `phase:2`
- **Rama:** `fix/AG-24-reintento-validacion`
- **Descripción:**
  - extraer el primer objeto JSON aunque venga entre bloques de código o con preámbulo;
  - ante `ValidationError`, un reintento con un mensaje de corrección sin datos;
  - límite de tiempo total por tarea;
  - `max_tokens` configurable por tarea.
- **Justificación:** desviación de D6 (`providers.py:147-150`).
- **Módulos:** `app/providers.py`, `app/config.py`, tests.
- **Dependencias:** AG-23 (registrar los reintentos).
- **Criterios de aceptación:**
  - [ ] Casos de bloque de código, preámbulo, inválido→válido e inválido×2 → ERROR con código.
  - [ ] Sin fallback a mock.
- **Pruebas:** `httpx.MockTransport`.
- **Riesgos de integración:** más latencia; respetar los timeouts.

### AG-25 · Corpus anotado sintético (contrato C7)
- **Prioridad · esfuerzo · rol:** P1 · M · B (los tres anotan) — `evals`, `phase:2`
- **Rama:** `evals/AG-25-corpus`
- **Descripción:** `evals/llm/corpus.jsonl` con:
  - ≥ 40 casos de extracción;
  - ≥ 30 pares de deduplicación;
  - ≥ 15 explicaciones;
  - dos anotadores y desacuerdos registrados;
  - frases de D-01, D-02 y D-03;
  - ningún dato personal real.
- **Justificación:** OF-06, AI-09; B06.
- **Módulos:** `evals/llm/`, prueba de formato.
- **Dependencias:** AG-01, AG-02 (reglas estables).
- **Criterios de aceptación:**
  - [ ] Acuerdo entre anotadores reportado.
  - [ ] Validador en pytest.
  - [ ] Procedencia documentada.
- **Pruebas:** validador de formato.
- **Riesgos de integración:** sesgo de redacción; alternar autores.

### AG-26 · Harness de evaluación de modelos con salvaguarda de cuota
- **Prioridad · esfuerzo · rol:** P1 · M · B — `evals`, `phase:2`
- **Rama:** `evals/AG-26-harness-llm`
- **Descripción:** `scripts/evaluate_llm.py --provider mock|nvidia --model X --repeats 3`. El modo
  live exige `AGUAIA_ALLOW_LIVE_LLM=1`. Calcula las métricas de GAP §6.2 y escribe en
  `evals/llm/results/`. En CI solo corre el modo mock.
- **Justificación:** AI-09.
- **Módulos:** `scripts/`, `evals/llm/`.
- **Dependencias:** AG-23, AG-25 (AG-24 recomendado).
- **Criterios de aceptación:**
  - [ ] El modo mock es reproducible en CI.
  - [ ] Sin la variable, el modo live se niega a ejecutarse.
  - [ ] Genera un informe en markdown.
- **Pruebas:** prueba del harness en modo mock.
- **Riesgos de integración:** límites de tasa y costos (solo con autorización).

### AG-27 · Evaluación real de DeepSeek V4.1 Flash, Kimi K3 y GPT-OSS-20B
- **Prioridad · esfuerzo · rol:** P1 · S · B — `evals`, `needs-authorization`, `phase:2`
- **Rama:** `evals/AG-27-evaluacion-real`
- **Descripción:**
  1. sondeo de disponibilidad (confirmar el ID `moonshotai/kimi-k3`);
  2. ejecutar el harness;
  3. sección «Inferencia real» en EVALUATION.md;
  4. modelo por defecto justificado;
  5. lista de modelos evaluados (para la regla R8).
- **Justificación:** AI-04, AI-05; B01. Kimi K3 nunca se invocó.
- **Módulos:** `docs/EVALUATION.md`, `docs/NVIDIA_SMOKE.md`, `.env.example`.
- **Dependencias:** AG-24, AG-26; **autorización de cuota**.
- **Criterios de aceptación:**
  - [ ] Tabla comparativa con métricas y n.
  - [ ] Tokens y latencias reportados.
  - [ ] Decisión registrada.
  - [ ] Sin claves ni datos personales.
- **Pruebas:** el propio harness.
- **Riesgos de integración:** un modelo no disponible se registra como resultado; no se oculta.

### AG-28 · Modelo por tarea (opcional)
- **Prioridad · esfuerzo · rol:** P2 · S · B — `agents`, `phase:2`
- **Rama:** `feat/AG-28-modelo-por-tarea`
- **Descripción:** `NVIDIA_MODEL_EXTRACT`, `NVIDIA_MODEL_DEDUP` y `NVIDIA_MODEL_EXPLAIN`, con
  `NVIDIA_MODEL` como respaldo. El nombre de proveedor compuesto mantiene el chequeo
  `PROVIDER_CONFIGURATION_CHANGED`.
- **Justificación:** usar el modelo más adecuado para cada tarea según AG-27.
- **Módulos:** `app/config.py`, `app/providers.py`, `app/worker.py`.
- **Dependencias:** resultados de AG-27.
- **Criterios de aceptación:**
  - [ ] Compatibilidad con las ejecuciones existentes.
- **Pruebas:** unitarias.
- **Riesgos de integración:** ejecuciones antiguas con otro nombre de proveedor.

---

## Fase 3 — Cisternas y distribución

### AG-29 · [Contrato C5 + ADR-004] Modelo de planificación de distribución
- **Prioridad · esfuerzo · rol:** P0 · S · A + B (revisa C) — `backend`, `agents`, `adr`, `contract-change`, `phase:3`
- **Rama:** `docs/AG-29-adr-planificacion` y `feat/AG-29-contratos-planificacion`
- **Descripción:** el ADR-004 recoge:
  - la formulación de GAP §7.2 (asignación por viajes con CP-SAT, Fase 3a);
  - procedencia obligatoria de los datos;
  - un grafo de planificación separado con `thread_id = plan_id`;
  - el HITL del plan (APPROVE, REJECT, REQUEST_CHANGES);
  - «aprobado» **no significa despacho**.

  Además: contratos Pydantic C5, `types.ts` y fixtures JSON sintéticas compartidas.
- **Justificación:** FN-09 a FN-14; B08.
- **Módulos:** `docs/adr/004-*.md`, `contracts.py`, `frontend/src/types.ts`, `backend/tests/fixtures/`.
- **Dependencias:** AG-14 (la entrada es la prioridad vigente).
- **Criterios de aceptación:**
  - [ ] ADR aprobado por los tres.
  - [ ] Contratos, fixtures y tipos integrados.
  - [ ] `source` o `is_synthetic` obligatorio en todo dato de flota y matriz.
- **Pruebas:** validación de fixtures.
- **Riesgos de integración:** desbloquea AG-30 a AG-35; revisarlo con prioridad.

### AG-30 · Migración de planificación y CRUD protegido de flota, depósitos y matriz
- **Prioridad · esfuerzo · rol:** P0 · M · A — `backend`, `phase:3`
- **Rama:** `feat/AG-30-flota-depositos`
- **Descripción:**
  - una migración con `depots`, `tankers`, `travel_times` (con `source`), `plan_runs`,
    `plan_reviews` y `plan_trips`;
  - servicios con validación (capacidad > 0, turnos válidos, matriz completa para los pares usados);
  - endpoints admin protegidos;
  - seed `data/fleet.demo.json` con valores **ficticios rotulados**.
- **Justificación:** FN-09, FN-10, FN-12.
- **Módulos:** `models.py`, migración, `services.py`, `api.py`, `app/seed.py`, `data/`.
- **Dependencias:** AG-07, AG-29.
- **Criterios de aceptación:**
  - [ ] Migración reversible y `alembic check` limpio.
  - [ ] 401 sin token y 422 con datos inválidos.
  - [ ] Seed idempotente.
  - [ ] Los nombres incluyen «demostrativo».
- **Pruebas:** httpx y migraciones.
- **Riesgos de integración:** confundir valores ficticios con reales; rotularlos siempre.

### AG-31 · Estimación de demanda por comunidad
- **Prioridad · esfuerzo · rol:** P0 · S · A — `backend`, `phase:3`
- **Rama:** `feat/AG-31-demanda`
- **Descripción:** función pura `estimate_demand` con `DistributionPolicyConfig` versionada
  (`dist-v0.1.0-demo`). Los litros por persona y día son un parámetro a validar; la referencia Esfera
  se documenta, no es norma panameña. Población desconocida → demanda desconocida con bandera,
  **nunca 0**, y excepción humana en el plan.
- **Justificación:** FN-11.
- **Módulos:** `app/planning_policy.py` (o `domain.py`), tests.
- **Dependencias:** AG-29.
- **Criterios de aceptación:**
  - [ ] Pruebas con población nula.
  - [ ] La versión aparece en la salida.
- **Pruebas:** unitarias.
- **Riesgos de integración:** el sector sin censo debe ser visible en el plan.

### AG-32 · Solver de asignación con OR-Tools CP-SAT
- **Prioridad · esfuerzo · rol:** P0 · L · B — `agents`, `phase:3`
- **Rama:** `feat/AG-32-solver-cpsat`
- **Descripción:** `app/planning.py` puro que transforma la instantánea de planificación en
  `PlanResult` (GAP §7.2):
  - reproducible (`num_workers=1`, semilla, límite de tiempo);
  - diagnóstico de infactibilidad determinístico;
  - la escasez se reporta como demanda no cubierta.

  Añadir `ortools` tras verificar wheels de Python 3.13 en Windows y Linux.
- **Justificación:** FN-13; núcleo del reto.
- **Módulos:** `app/planning.py`, `pyproject.toml`, `uv.lock`, tests.
- **Dependencias:** AG-29, AG-31 (puede empezar con fixtures).
- **Criterios de aceptación:**
  - [ ] ≥ 6 casos calculables a mano:
    - una cisterna y una comunidad;
    - turno insuficiente;
    - prioridades distintas;
    - depósito limitante;
    - mínimo crítico infactible;
    - empate resuelto por id.
  - [ ] 10 ejecuciones con la misma entrada dan la misma salida.
  - [ ] Menos de 2 s en el escenario de demo.
  - [ ] CI verde en ambos sistemas operativos.
- **Pruebas:** unitarias y de determinismo.
- **Riesgos de integración:** tamaño de la dependencia y tiempo de CI; no determinismo con varios workers.

### AG-33 · Grafo de planificación con HITL de plan en el worker
- **Prioridad · esfuerzo · rol:** P0 · L · B — `agents`, `phase:3`
- **Rama:** `feat/AG-33-grafo-planificacion`
- **Descripción:** `build_planning_graph`:
  1. snapshot (incidentes con prioridad vigente + flota);
  2. `solve` (herramienta pura);
  3. `explain` (LLM opcional, verificado como en AG-21);
  4. `human_review` (`interrupt`);
  5. `finalize` idempotente.

  El worker atiende `plan_runs` bajo el mismo lock y recupera como indica ADR 001.
- **Justificación:** FN-14; agente planificador (GAP §4.3).
- **Módulos:** nuevo `app/planning_graph.py`, `app/worker.py`, `app/tools.py`.
- **Dependencias:** AG-30, AG-32; AG-34 para las pruebas HTTP.
- **Criterios de aceptación:**
  - [ ] Replay idempotente.
  - [ ] Un reinicio en WAITING_APPROVAL conserva el plan.
  - [ ] Revisión concurrente → 409.
  - [ ] Las 22 evals del grafo de reportes no cambian.
- **Pruebas:** resiliencia equivalente a `test_resilience.py`.
- **Riesgos de integración:** el worker es compartido: un solve largo bloquea reportes (usar límite de
  tiempo). R5.

### AG-34 · API de corridas de planificación y revisión del plan
- **Prioridad · esfuerzo · rol:** P0 · M · A — `backend`, `phase:3`
- **Rama:** `feat/AG-34-api-planes`
- **Descripción:**
  - `POST /api/admin/plans`: responde 202, con `Idempotency-Key`;
  - `GET /api/admin/plans` y `GET /api/admin/plans/{id}`;
  - `POST /api/admin/plans/{id}/review`: compare-and-set, razón obligatoria;
  - `response_model` del contrato C5.
- **Justificación:** FN-14; ADR 001 (la API no ejecuta el solver).
- **Módulos:** `api.py`, `services.py`, tests.
- **Dependencias:** AG-29, AG-30. Se integra con AG-33.
- **Criterios de aceptación:**
  - [ ] El 202 no ejecuta el solver.
  - [ ] 401, 409 y 422 donde corresponde.
  - [ ] Idempotencia.
  - [ ] Prueba e2e HTTP con el worker.
- **Pruebas:** httpx y e2e.
- **Riesgos de integración:** contrato compartido con C.

### AG-35 · Vista de flota y propuesta de plan
- **Prioridad · esfuerzo · rol:** P0 · M · C — `frontend`, `phase:3`
- **Rama:** `feat/AG-35-ui-distribucion`
- **Descripción:** vista «Distribución» con:
  - flota rotulada como ficticia;
  - botón «Generar plan»;
  - viajes por cisterna;
  - cobertura por comunidad (demanda, planificado, no cubierto);
  - advertencias y explicación de la infactibilidad;
  - aprobación con razón.

  Nunca mostrar «despachado».
- **Justificación:** FN-14; demostración del reto.
- **Módulos:** `frontend/src`.
- **Dependencias:** AG-29 (fixtures), AG-34.
- **Criterios de aceptación:**
  - [ ] Todos los estados representados.
  - [ ] Lenguaje operativo.
  - [ ] Responsive.
- **Pruebas:** Vitest con fixtures.
- **Riesgos de integración:** el contrato puede cambiar; usar fixtures versionadas.

### AG-36 · Evals de planificación
- **Prioridad · esfuerzo · rol:** P0 · S · B — `evals`, `phase:3`
- **Rama:** `evals/AG-36-planificacion`
- **Descripción:** ≥ 8 escenarios ejecutados por pytest:
  - escasez;
  - crítico infactible;
  - cisterna fuera de turno;
  - depósito limitante;
  - empate;
  - sector sin censo;
  - rechazo humano;
  - reanudación tras reinicio.

  Métricas por grupo en el runner.
- **Justificación:** OF-06 extendido al núcleo del reto.
- **Módulos:** `evals/`, `scripts/evaluate.py`, `backend/tests/`, `docs/EVALUATION.md`.
- **Dependencias:** AG-33.
- **Criterios de aceptación:**
  - [ ] Métricas en los resultados.
  - [ ] EVALUATION actualizado.
- **Pruebas:** las propias evals.
- **Riesgos de integración:** conflicto en `cases.json`; usar un archivo propio.

### AG-37 · Rutas multiparada con ventanas (CVRPTW)
- **Prioridad · esfuerzo · rol:** P2 · L · B — `phase:3`
- **Rama:** `feat/AG-37-rutas-cvrptw`
- **Descripción:** routing de OR-Tools con dimensión de capacidad y de tiempo con ventanas.
- **Justificación:** FN-15.
- **Módulos:** `app/planning.py`.
- **Dependencias:** **matriz completa verificada** y AG-32.
- **Criterios de aceptación:**
  - [ ] Rutas factibles en casos pequeños calculables.
  - [ ] Ventanas respetadas.
- **Pruebas:** unitarias.
- **Riesgos de integración:** sin datos reales es solo una demostración técnica.

### AG-38 · Registro de ejecución de entregas
- **Prioridad · esfuerzo · rol:** P2 · M · A + C — `phase:3`
- **Rama:** `feat/AG-38-seguimiento-entregas`
- **Descripción:** estados por viaje `PLANNED`, `IN_PROGRESS`, `DELIVERED` y `FAILED`, con
  confirmación humana. Puede cerrar el incidente mediante AG-17.
- **Justificación:** FN-16.
- **Módulos:** modelos, API y UI.
- **Dependencias:** AG-33, AG-17.
- **Criterios de aceptación:**
  - [ ] Cada transición queda auditada.
  - [ ] No existe ninguna «entrega» sin confirmación humana.
- **Pruebas:** transiciones.
- **Riesgos de integración:** migración.

---

## Fase 4 — Supervisión por excepciones

### AG-39 · [ADR-005, contrato C6] Política de revisión por excepciones
- **Prioridad · esfuerzo · rol:** P1 · M · B — `agents`, `adr`, `phase:4`
- **Rama:** `feat/AG-39-politica-revision`
- **Descripción:** función pura `route_review` con `ReviewPolicyConfig` versionada y las reglas R1–R11
  (GAP §8.2). Los parámetros W, H, L, Δ y S son configurables.
- **Justificación:** FN-17; reducir revisiones rutinarias sin perder el HITL.
- **Módulos:** `app/review_policy.py`, `contracts.py`, `docs/adr/005-*.md`.
- **Dependencias:** AG-14; AG-27 para R8.
- **Criterios de aceptación:**
  - [ ] Caso positivo y negativo por cada regla.
  - [ ] ADR aprobado por los tres.
- **Pruebas:** tabla de casos.
- **Riesgos de integración:** que la percepción de HITL se debilite; justificarlo en el ADR.

### AG-40 · Nodo `triage` y finalización automática auditada
- **Prioridad · esfuerzo · rol:** P1 · M · B — `agents`, `phase:4`
- **Rama:** `feat/AG-40-triage`
- **Descripción:**
  - nodo entre `coordination` y `human_review`;
  - `finalize_auto` guarda un `Review` con `actor=policy:<versión>` y los códigos de razón;
  - `REVIEW_MODE` vale `all_human` por defecto;
  - muestreo determinístico.
- **Justificación:** FN-17.
- **Módulos:** `app/graph.py`, `app/agents.py`, `app/services.py`, `app/config.py`.
- **Dependencias:** AG-39.
- **Criterios de aceptación:**
  - [ ] Las 22 evals no cambian en `all_human`.
  - [ ] Evals E23+ cubren AUTO y HUMANO.
  - [ ] Un hilo pausado antes del despliegue se reanuda bien.
- **Pruebas:** replay, idempotencia y muestreo.
- **Riesgos de integración:** cambio de topología (R5); drenar la cola antes de desplegar.

### AG-41 · Bandeja de excepciones y registro de decisiones automáticas
- **Prioridad · esfuerzo · rol:** P1 · M · C — `frontend`, `phase:4`
- **Rama:** `feat/AG-41-ui-excepciones`
- **Descripción:** la bandeja muestra el motivo en español de cada regla. Lista de decisiones
  automáticas con botón «Revertir» (AG-42) e indicador de muestreo.
- **Justificación:** FN-17 visible y auditable.
- **Módulos:** `frontend/src`.
- **Dependencias:** AG-40, AG-42.
- **Criterios de aceptación:**
  - [ ] Cada decisión automática muestra regla, versión y si se puede revertir.
- **Pruebas:** Vitest.
- **Riesgos de integración:** contrato C6.

### AG-42 · Reversión de decisiones automáticas
- **Prioridad · esfuerzo · rol:** P1 · S · A — `backend`, `phase:4`
- **Rama:** `feat/AG-42-reversion`
- **Descripción:** `POST /api/admin/executions/{id}/revert {reason}`, válido solo si el actor fue
  la política. Reabre la revisión humana. `Review` usa `execution_id` como PK, así que la
  reversión necesita una tabla de anulaciones o un versionado de revisiones (decidir en ADR-005).
- **Justificación:** HITL por excepciones con control humano posterior.
- **Módulos:** `api.py`, `services.py`, migración.
- **Dependencias:** AG-40.
- **Criterios de aceptación:**
  - [ ] Una decisión humana no se puede revertir por esta vía.
  - [ ] La reversión queda auditada.
  - [ ] Es idempotente.
- **Pruebas:** httpx y concurrencia.
- **Riesgos de integración:** migración y semántica de la prioridad vigente (AG-14).

---

## Fase 5 — Geo, comunicación y multimodal (P2, condicionadas)

| ID | Título | Rol · esf. | Rama | Dependencias | Criterios de aceptación clave | Riesgo |
|---|---|---|---|---|---|---|
| AG-43 | Vista geográfica de sectores | C · L | `feat/AG-43-vista-geo` | Geodatos verificados con licencia | Sin coordenadas inventadas; esquema por distrito mientras no haya datos | Inventar geografía |
| AG-44 | Mensajes ciudadanos de estado | B+C · M | `feat/AG-44-mensajes` | AG-33 | Plantillas determinísticas; paráfrasis LLM opcional verificada; sin canal externo | Prometer horarios no planificados |
| AG-45 | Canal ciudadano autorizado (B12) | A+C · L | `feat/AG-45-canal` | AG-47, autorización | Consentimiento; dedupe de eventos externos; errores observables | PII y costos |
| AG-46 | Spike de entrada multimodal | B · L | `spike/AG-46-multimodal` | AG-47 | Informe de viabilidad (audio a texto), política de PII y evaluación | Voces, rostros, retención |
| AG-52 | Ampliar taxonomía (calidad del agua, intermitente) | B · S | `feat/AG-52-taxonomia` | AG-05 | Contrato, TS, mock y evals actualizados | Cambio de contrato |

## Fase 6 — Cierre, seguridad y operación

| ID | Título | P · rol · esf. | Rama | Dependencias | Criterios de aceptación clave | Riesgo |
|---|---|---|---|---|---|---|
| AG-47 | Identidad individual, retención y política de datos hacia NIM (B11) | P1 · A · M | `security/AG-47-identidad` | Requisitos de publicación | Roles; auditoría por persona; retención y PII; tests de acceso; retirar el token demo público | Cambia la auth del frontend |
| AG-48 | Validar catálogo de sectores con fuente oficial (B07) | P1 · A+equipo · M | `data/AG-48-catalogo` | Fuente autorizada | Fuente, fecha, licencia y procedencia por campo; sin mezclar sintético con confirmado | Licencias |
| AG-49 | Video ≤ 3 min, checklist y congelamiento (B05) | **P0** · C+equipo · S | `docs/AG-49-entrega` | Demo estable | Guion DEMO actualizado; distinguir mock de real; checklist; tag solo con autorización | Plazo |
| AG-50 | Despliegue mismo origen con HTTPS y supervisor | P2 · A · L | `ops/AG-50-despliegue` | AG-47 | Un solo worker; respaldo consistente de ambos SQLite; pruebas de carga | Exposición pública |
| AG-51 | Verificar PostgreSQL (asyncpg + saver de Postgres) | P2 · A · M | `ops/AG-51-postgres` | — | Matriz CI con Postgres; migraciones; recuperación | Diferencias de dialecto |

---

## Orden de ejecución sugerido (primeras olas)

| Ola | Rol A | Rol B | Rol C |
|---|---|---|---|
| 1 | AG-07 → AG-13 | AG-01 → AG-02 | AG-12 y borrador de glosario C8 y maquetas de bandeja |
| 2 | AG-14 (ADR con B) → AG-04, AG-06 | AG-15 (ADR con todos) → AG-03, AG-05 | AG-18 con fixtures |
| 3 | AG-16 → AG-17 | AG-21; AG-23 → AG-24 (Fase 2) | AG-19 → AG-22 |
| 4 | AG-29 (con B) → AG-30 → AG-31 | AG-32 | AG-35 con fixtures |
| 5 | AG-34 | AG-33 → AG-36 | AG-35 integración; AG-49 |

AG-08 y AG-10 se hacen en cuanto haya confirmación o autorización.

---

## Apéndice B — Backlog anterior (preservado)

Equivalencias:

| Anterior | Nuevo |
|---|---|
| B01 | AG-24 a AG-27 |
| B02 | AG-13, AG-14 |
| B03 | AG-22 |
| B04 | AG-10 |
| B05 | AG-49 |
| B06 | AG-25 |
| B07 | AG-48 |
| B08 | AG-29 |
| B09 | AG-32, AG-33 |
| B10 | AG-35 |
| B11 | AG-47 |
| B12 | AG-45 |
| B13 | AG-08 |

Contenido original:

Tamaños: S ≈ medio día, M ≈ 1 día, L ≈ 2–3 días. Son estimaciones para dividir trabajo, no compromisos.
Organizar en Backlog / Todo / In Progress / In Review / Done, una tarea activa por integrante.

| Tarea | Rol sugerido | P | Tamaño | Dependencias | Criterios de aceptación |
|---|---|---|---|---|---|
| B01 Verificación NIM con cuenta del equipo | Agentes/evals | P0 | S | Credenciales autorizadas | Ejecutar ambos modelos disponibles, registrar latencia/contratos/errores sin secretos ni fallback; conservar evidencia real separada |
| B02 Revisión operativa y contrato compartido | Backend | P0 | S | Demo local | Revisar dedupe/cola/HITL y OpenAPI con equipo; documentar cualquier cambio de contrato y pruebas |
| B03 Auditoría visual y accesibilidad | Frontend | P0 | S | Backend local | Recorrer reporte/aprobar/rechazar/corregir por teclado y móvil, comprobar errores/vacíos y grabar evidencia |
| B04 Ejecutar CI y preparar protección main | Backend | P0 | S | Autorización de acciones remotas | Workflows verdes en Windows/Linux, exigir checks/revisión cuando se autorice; no filtrar secretos |
| B05 Video ≤3 minutos y entrega oficial | Frontend + equipo | P0 | S | B01–B04 | Seguir DEMO; distinguir mock/real; revisar checklist, registro y ventana oficial; tag solo al final autorizado |
| B06 Corpus semántico y anotación humana | Agentes/evals | P1 | M | B01, datos autorizados | ≥30 pares anotados por humanos, precision/recall por sector/tipo, comparar modelos sin inventar métricas |
| B07 Validar catálogo de sectores y vulnerabilidad | Backend + dominio | P1 | M | Fuente oficial autorizada | Fuente/fecha/licencia documentadas, procedencia por campo, no mezclar sintético con confirmado |
| B08 Contrato mínimo de planificación | Backend | P1 | S | B02 y B07 | Definir incidentes aprobados, flota, capacidad/horarios y resultado; TS/fixtures acordados sin implementar rutas aún |
| B09 Agente planificador OR-Tools | Agentes | P1 | L | B08 | Plan factible con capacidades y límites, infeasibilidad explicada, tests y nuevo HITL antes de asignar |
| B10 Vista de flota y propuesta de plan | Frontend | P1 | M | B08; B09 para integrar | Consumo del contrato, estados reales, aprobación accesible y sin fingir despacho |
| B11 Identidad individual y retención | Backend | P1 | M | Requisitos de publicación | Roles, auditoría por persona, política de retención/PII y tests de acceso; retirar token demo público |
| B12 Canal ciudadano autorizado | Frontend/integraciones | P2 | L | B11 | Un canal real con consentimiento, dedupe de eventos externos y errores observables |
| B13 Aclarar módulos adicionales encontrados | Backend | P0 | S | Confirmar origen con equipo | Revisar config.py/contracts.py/domain fuera de app; conservar trabajo paralelo y consolidar contratos/política antes de importarlos; runtime probado usa app |

Primeras tareas paralelas: B02 en `backend/`, B01 en `providers.py`/`evals/`, B03 en `frontend/`.
Coordinar cambios a `contracts.py`, OpenAPI y tipos TS antes de editar; un PR de contrato precede
a PRs dependientes. Los responsables son roles para que el equipo distribuya según disponibilidad.

Cambios de prioridad respecto al backlog anterior, con justificación:

| Tarea | Antes | Ahora | Motivo |
|---|---|---|---|
| B08/B09/B10 → AG-29 a AG-35 | P1 | P0 | El plan de asignación es la respuesta al problema del reto |
| B13 → AG-08 | P0 | P1 | El runtime no importa esos módulos (verificado); es deuda, no un bloqueo |
