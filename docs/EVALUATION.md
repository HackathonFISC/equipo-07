# Evaluación y resultados verificados

Ejecución local del 2026-10-16 en Windows, Python 3.13.5, Node 24.19.0 y uv 0.13.0.
La suite automática se ejecutó sin llamadas externas ni claves reales. Una comprobación posterior
con NVIDIA y credenciales configuradas se registra en [NVIDIA_SMOKE](NVIDIA_SMOKE.md), separada
de las métricas offline. No se ejecutó CI remoto.

| Verificación | Resultado observado |
|---|---|
| Backend: `pytest -q -p no:cacheprovider --cov=app --cov-report=term-missing` | **53 passed**, 19.69 s; cobertura de líneas **86 %** |
| Evals: `python ../scripts/evaluate.py` | **31/31** (2026-10-16, incluye 9 del planificador); resultados JSON/XML guardados |
| Backend tras el planificador | **69 passed**, cobertura de líneas **87 %**; `planner.py` 100 % |
| Frontend tras el planificador | **8/8** en Vitest |
| Frontend: `npm test` (Vitest 5.0.5) | **6/6** componentes/interacciones aprobados |
| Ruff lint y formato | Aprobados, incluidos app, tests y migraciones |
| mypy | Sin errores en contracts, domain y config; no se afirma tipado estricto de todo el backend |
| Alembic | upgrade head, seed dos veces, check, downgrade y upgrade en DB temporal aprobados |
| `uv sync --locked` | Lock válido, entorno sincronizado sin cambios |
| ESLint / TypeScript | Aprobados |
| Vite build | Aprobado; bundle JS 272.89 kB (84.51 kB gzip), CSS 9.05 kB |
| Vite dev | Arrancó en localhost y sirvió HTML AguaIA con HTTP 200 |
| npm audit durante instalación corregida | **0 vulnerabilidades reportadas**; se actualizó Vitest por avisos en dependencias previas |

Las 22 evaluaciones son parte de las 53 pruebas backend, no 22 pruebas adicionales. Los tiempos
son observaciones de esta máquina y ejecución, no objetivos de rendimiento ni garantías de latencia.
La cobertura no incluye necesariamente toda ejecución de procesos hijos; no equivale a corrección total.

## Casos y métricas

[cases.json](../evals/cases.json) contiene ID, escenario y descripción. Cada ID se ejecuta en
`backend/tests/test_evaluations.py` con entrada concreta y aserciones de estado/DB/contratos.
[results.json](../evals/results.json) conserva timestamp, modo, resultados por caso, duración y
conteos; [results.xml](../evals/results.xml) es la evidencia JUnit producida por pytest.

Métrica principal: escenarios con todas sus aserciones aprobadas / escenarios ejecutados = **31/31**.
Métricas por grupo calculadas por el runner:

- Consolidación: E05/E06/E07/E18/E20/E22 = **6/6**.
- Guardrails: E03/E10/E11/E12/E16/E20/E21/E27/E28/E31 = **10/10**.
- Planificador: E23–E31 = **9/9** (plan propuesto y aprobado, sin ubicación inventada, fuga derivada a
  reparación, cisternas excluidas, cisterna desconocida, sin token, rechazo, plan único pendiente,
  privacidad de conductores). El solver tiene además pruebas unitarias en `test_planner.py`.
- Decisión humana: E01/E14/E15/E17/E18/E19/E23/E29/E30 = **9/9**.

Los grupos se solapan. Son cumplimiento de escenarios, no precision/recall de un modelo real.
La prueba semántica usa reglas del mock, por lo que no valida comprensión semántica de DeepSeek/Kimi.
El motor se verifica aparte con umbrales, empates, máximo, ausentes, política configurable y entradas inválidas.

## Evidencia del desacoplamiento y recuperación

- Cada eval válida verifica que POST responde 202 QUEUED sin propuesta antes de ejecutar worker.
- `test_real_http_queue_and_worker_restart` arranca Uvicorn real con base temporal; acepta un reporte
  con worker apagado, arranca worker, espera HITL, lo mata, guarda aprobación con worker apagado,
  reinicia y comprueba APPROVED y exactamente una auditoría DECISION_APPLIED.
- `test_worker_interrupted_then_recovered` cancela durante ingesta y recupera RUNNING desde checkpoint.
- `test_recover_after_decision_commit_before_final_checkpoint` recupera la ventana entre guardar
  la decisión de negocio y confirmar el checkpoint final, sin duplicar su auditoría.
- Prueba de replay invoca dos veces cada agente y comprueba una sola mutación por entidad.
- Revisiones concurrentes no se sobreescriben. El lock impide un segundo worker local.
- `test_tool_revalidates_sector_and_kind_before_write` prueba el límite de herramientas incluso
  cuando el modelo sugiere HIGH hacia un candidato incompatible.

## Integración NIM

Cinco pruebas usan `AsyncOpenAI` real con `httpx.MockTransport`: ambos nombres de modelo,
extracción/dedupe/explicación tipadas y fallos de formato, timeout y HTTP 500. Comprueban que no se
exponen herramientas ni secretos y no hay fallback. **Estas pruebas unitarias no verifican el
servicio remoto NVIDIA**. La prueba real posterior verificó GPT-OSS-20B hasta HITL; no constituye
una evaluación de calidad ni valida DeepSeek/Kimi. Tras el ajuste del adaptador, las 53 pruebas
offline volvieron a pasar (16.79 s).

## Interfaz y límites

Las seis pruebas con Testing Library/jsdom verifican campos requeridos, solicitud/estado real del
contrato, carga/error, reintentos idempotentes, corrección con razón/token, token sin almacenamiento
persistente y polling terminal. No hubo prueba visual en navegador real ni auditoría manual de lector
de pantalla; se deja B03. El flujo backend HTTP sí se probó con procesos reales.

No se probó PostgreSQL, Linux, carga multiusuario sostenida ni operación pública. La matriz CI
incluye Windows/Linux, pero necesita ejecución remota autorizada. Hubo bloqueos iniciales del sandbox
en cachés/temp de Windows; las verificaciones indicadas se ejecutaron después con permisos concedidos.
