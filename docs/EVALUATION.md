# Evaluación y resultados verificados

Última ejecución local: 2026-10-17, Windows, Python 3.13, Node 22 y uv 0.13.0, con
`LLM_PROVIDER=mock`. La suite no hace llamadas externas ni usa claves reales. Las comprobaciones con
NVIDIA NIM y credenciales reales se registran aparte en [NVIDIA_SMOKE](NVIDIA_SMOKE.md) y no se mezclan
con estas métricas. No se ejecutó CI remoto.

| Verificación | Resultado observado |
|---|---|
| Backend: `pytest -q -p no:cacheprovider --cov=app` | **191 passed**; cobertura de líneas **87 %** (AG-41) |
| Evals: `python ../scripts/evaluate.py` | **64/64**; resultados en `evals/results.json` y `evals/results.xml` |
| Impacto: `python ../scripts/impact_report.py` | Mediana de la primera entrega crítica 143 min (AguaIA) frente a 292 min (volumen y llegada); cobertura crítica 100 % en las tres (`evals/impact.json`) |
| Frontend: `npm test` (Vitest 5.0.5) | **11/11** (`api.test.ts` y `App.test.tsx`) |
| Frontend: lint, typecheck y build | Aprobados |
| Backend: Ruff lint y formato | Aprobados en `app/`, `tests/` y `migrations/` |
| Backend: mypy | Sin errores en `contracts.py`, `domain.py` y `config.py`; no se afirma tipado estricto de todo el backend |
| Alembic | `upgrade head` y `alembic check` limpios; una sola cabeza |
| Datos: `python scripts/validate_datasets.py` | 20 ubicaciones y 4 cisternas válidas; `git diff data/` limpio |

Las 64 evals son parte de las 191 pruebas backend, no pruebas adicionales. Los tiempos de ejecución
son observaciones de esta máquina, no objetivos de rendimiento. La cobertura no equivale a corrección.

## Evaluación por capas

### 1. Funcional

Comprueba el ciclo completo con datos concretos y aserciones sobre estado, base de datos y contratos:
el 202 con cola durable, la normalización de la ingesta, la consolidación de reportes del mismo
sector, el puntaje 0–100 con intervalo, la aprobación humana de la prioridad, el plan de cisternas
con sus paradas y demandas no atendidas, la aprobación del plan y los avisos ciudadanos con hora
estimada. **Límite:** el lenguaje natural lo resuelve el `MockLLMProvider` con reglas por palabras
clave, así que estas pruebas verifican el flujo y los contratos, no la comprensión de un modelo real.

### 2. Adversos y guardrails

Comprueba que el sistema falla cerrado: inyecciones en el reporte y en los candidatos de
deduplicación, textos fuera de tema, horas inválidas o contradictorias, horas o instituciones críticas
que el modelo afirma sin que el texto las sustente, negaciones («no afecta al hospital»), acceso sin
token, cisternas desconocidas, privacidad de los conductores en el plan y fallos del proveedor
(formato inválido, timeout, HTTP 500) sin fallback al mock. La suite de robustez (E41–E54) suma jerga
panameña, instrucciones inertes que deben quedar como texto y fuera de tema. **Límite:** las defensas
son léxicas y de contrato (`extra="forbid"`, regex, compuertas de fundamentación); no garantizan
resistencia a ataques nuevos. En una corrida real con NIM, un reporte con JSON incrustado llevó al
modelo a marcar una institución crítica; la compuerta lo bloqueó y el reporte quedó en ERROR
([AI_LOG](AI_LOG.md)).

### 3. Impacto

`scripts/impact_report.py` corre el mismo solver, con la misma flota y las mismas demandas del
escenario F2-01, en tres órdenes: el puntaje aprobado de AguaIA, más reportes primero y orden de
llegada. Con AguaIA la mediana de la primera entrega a las tres instituciones críticas (hospital,
escuela y centro de salud) es 143 min; con las otras dos es 292 min. La cobertura crítica es 100 %
en las tres, es decir, AguaIA no cubre más demanda: llega antes. El plan real muestra la misma
comparación en su tarjeta de impacto. **Límite:** es un escenario sintético con velocidad media de
30 km/h, tortuosidad 1.4 y demandas supuestas ([DATA_SOURCES](DATA_SOURCES.md)); no modela tráfico,
desvíos ni averías, y un solo escenario no prueba la ventaja en general.

## Casos y grupos

[cases.json](../evals/cases.json) contiene ID, escenario y descripción; E01–54 se ejecutan en
`backend/tests/test_evaluations.py` y E55–64 en `test_agent_integrity.py::test_integrity_evaluation`.
Los grupos que calcula `scripts/evaluate.py` se solapan:

- Consolidación: E05, E06, E07, E18, E20, E22 = **6/6**.
- Guardrails: E03, E10, E11, E12, E16, E20, E21, E27, E28, E31 = **10/10**.
- Decisión humana: E01, E14, E15, E17, E18, E19, E23, E29, E30 = **9/9**.
- Planificador: E23–E31 = **9/9**. El solver tiene además pruebas unitarias en `test_planner.py`.
- Prioridad: E32–E40 = **9/9** (negaciones, criticidad del catálogo, duración en días, imprecisa o
  contradictoria, aprobación de intervalos).
- Robustez: E41–E54 = **14/14**.
- Integridad: E55–E64 = **10/10**, intervalos durables, 2630 habitantes frente a 8 puntos,
  desconocidos y rango 17–67, límites textuales y extracción nula.

AG-41 repitió backend/evals sobre el entorno creado con `uv sync --locked`: línea base
163 pruebas/54 evals, final 191/64. Las 10 regresiones iniciales de integridad fallaron antes
de corregir el código; también se reprodujo SCHEDULED → PRIORITIZED al aprobar un duplicado.
Pruebas adicionales comprueban snapshot/replay tras cambiar catálogo, hash idempotente anterior,
SQL filtrado antes del límite, flags falsificadas, respuesta truncada/refusal y migración con datos.
No se repitieron frontend, medición independiente de impacto, llamadas NIM reales ni CI remoto;
las filas históricas de esas verificaciones no son resultados de esta auditoría.

Son cumplimiento de escenarios, no precision/recall de un modelo real. El motor de prioridad se
verifica aparte con umbrales, empates, máximo, ausentes, política configurable y entradas inválidas.

## Evidencia del desacoplamiento y recuperación

- Cada eval válida verifica que POST responde 202 QUEUED sin propuesta antes de ejecutar el worker.
- `test_real_http_queue_and_worker_restart` arranca Uvicorn real con base temporal; acepta un reporte
  con el worker apagado, arranca el worker, espera la revisión humana, lo mata, guarda la aprobación
  con el worker apagado, reinicia y comprueba APPROVED y exactamente una auditoría DECISION_APPLIED.
- `test_worker_interrupted_then_recovered` cancela durante la ingesta y recupera desde checkpoint.
- `test_recover_after_decision_commit_before_final_checkpoint` recupera la ventana entre guardar la
  decisión de negocio y confirmar el checkpoint final, sin duplicar su auditoría.
- Una prueba de replay invoca dos veces cada agente y comprueba una sola mutación por entidad.
- Revisiones concurrentes no se sobreescriben. El lock impide un segundo worker local.
- `test_tool_revalidates_sector_and_kind_before_write` prueba el límite de herramientas incluso
  cuando el modelo sugiere HIGH hacia un candidato incompatible.

## Integración NIM

Las pruebas de `test_provider.py` usan `AsyncOpenAI` real con `httpx.MockTransport`: contratos de
extracción, deduplicación y explicación, fallos de formato, timeout y HTTP 500 sin filtrar secretos,
separación entre puntos y horas en la explicación, y el envío de fotos al modelo de visión. **No
verifican el servicio remoto.** Aparte, corridas reales con `openai/gpt-oss-20b` llevaron reportes
hasta la revisión humana, y `nemotron-3-nano-omni` describió fotos en español; no constituyen una
evaluación de calidad del modelo.

## Interfaz y límites

Las pruebas con Testing Library y jsdom cubren campos requeridos, contrato de solicitud y estado,
carga y error, reintentos idempotentes, corrección con razón y token, token sin almacenamiento
persistente, polling, plan de cisternas y tarjeta de impacto. No hubo prueba visual automatizada en
navegador ni auditoría con lector de pantalla.

No se probó PostgreSQL, Linux, carga multiusuario sostenida ni operación pública. La matriz de CI
incluye Windows y Linux, pero necesita ejecución remota.
