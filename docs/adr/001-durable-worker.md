# ADR 001 — Aceptación HTTP y worker durable local

Estado: implementado, 2026-10-16. Precisión técnica a D2; conserva D1–D7.

El diagrama original ejecuta LangGraph antes de responder 202 y afirma que la interrupción async
desacopla HTTP. `async/await` no constituye una cola durable ni evita esperar al proveedor.

Decisión: la API guarda `Report` + `Execution(QUEUED)` + auditoría en una sola transacción y responde
202 con `thread_id`. Un proceso `python -m app.worker` lee esa cola relacional. No se usa
`BackgroundTasks`, `create_task` en API, Redis ni un broker externo.

La revisión hace compare-and-set de `WAITING_APPROVAL` a `RESUME_QUEUED` y guarda un `Review`
inmutable por ejecución. Responde 202 antes de reanudar. El worker usa `Command(resume=...)` solo
si el checkpoint conserva una interrupción; si ya avanzó, usa `ainvoke(None)` para continuar.

Un lock del sistema operativo, junto al archivo de checkpoints, impide dos workers locales.
Al arrancar bajo ese lock, recupera `RUNNING` como `QUEUED`. Consulta checkpoint y revisión para
elegir continuar, reanudar o reconocer finalización. La cola sobrevive a que la API o worker terminen.
El sistema operativo libera el lock incluso al matar el proceso; los archivos de lock no se borran.

Los nodos persistentes son idempotentes por reporte/ejecución. No hay transacción abierta durante
llamadas LLM ni HITL. Los eventos técnicos pueden repetirse en replay y representan intentos;
las mutaciones de negocio no se duplican.

La aplicación de la decisión guarda revisión/puntuación/auditoría pero conserva RUNNING. Solo el
worker publica APPROVED/REJECTED después del checkpoint final. Si cae entre ambos commits, el
trabajo sigue siendo recuperable y `applied_at` evita aplicar por segunda vez la decisión.

Límites: un host, un worker, una configuración de almacenamiento compartida; no escalar cambiando
el checkpoint path ni ejecutar en volúmenes diferentes para la misma DB. Un sistema multi-host
necesitará leases/fencing y checkpointer de PostgreSQL. Un fallo queda `ERROR`; reintento manual
protegido, sin fallback. El proveedor de una ejecución no cambia silenciosamente al reiniciar.

Evidencia: `test_evaluations.py`, `test_resilience.py`, `test_process_e2e.py`.
