# Evidencia de integración AG-52 · 2026-10-17

Ejecución local real de React/Vite → proxy HTTP → FastAPI → LangGraph → worker y checkpoints.
Proveedor **mock-deterministic**, sin inferencia NVIDIA. Las decisiones las registró una prueba
automatizada, no un coordinador humano real. Todo el almacenamiento fue aislado y temporal.
No se aplicaron migraciones sobre datos locales existentes.

Se ajustó únicamente el catálogo de la base temporal: arraijan-demo con población sintética
2630 y vulnerabilidad null, para reproducir el rango 17–67. No se alteraron datasets versionados,
pesos, agentes ni solver. Los reportes, propuestas y planes de las imágenes son datos de prueba.

Resultado de la ejecución final: [flow.json](flow.json). Incluye IDs de correlación de prueba,
estado aplicado, endpoints comprobados y errores observados (ninguno en el recorrido final).
Los IDs pertenecen a esa base temporal; no se consultan en la base de trabajo del equipo.

| Captura | Evidencia |
|---|---|
| [01-ciudadano](01-ciudadano.png) | Selección del intervalo, descripción y revisión antes del envío |
| [02-operacion](02-operacion.png) | Duración declarada, 17–67 puntos, datos faltantes y acciones |
| [03-auditoria](03-auditoria.png) | Nodos y cronología reales, declaración/normalización, inputs, factores y asociación |
| [04-auditoria-movil](04-auditoria-movil.png) | Auditoría accesible y seis pestañas visibles a 390 px |
| [05-operacion-movil-oscuro](05-operacion-movil-oscuro.png) | Operación en modo oscuro, misma navegación |
| [06-decision-pendiente](06-decision-pendiente.png) | Decisión durable, worker detenido intencionalmente para observar la espera |
| [07-decision-aplicada](07-decision-aplicada.png) | 42 puntos aplicados al reiniciar el worker |
| [08-cisternas-propuesta](08-cisternas-propuesta.png) | Plan calculado y revisión del plan existente |
| [09-mapa-propuesto](09-mapa-propuesto.png) | Propuesta diferenciada de programación; sin líneas viales |
| [10-mapa-aprobado](10-mapa-aprobado.png) | Asignación programada, ubicación aproximada y sector no atendido |
| [11-mapa-reportes](11-mapa-reportes.png) | Conteos agregados reales de la base temporal |
| [12-mapa-movil](12-mapa-movil.png) | Navegación y mapa responsive |

El script de comprobación usó Chrome mediante DevTools, sin dependencias adicionales de frontend.
Comprobó 1440×1100 y 390×844, claro/oscuro y prefers-reduced-motion. La selección de intervalo y
la decisión principal se hicieron por la interfaz. Un segundo reporte sintético de hospital y su
revisión por HTTP permitieron comprobar un plan con cisternas; el plan se generó/aprobó por UI.
El endpoint público terminó mostrando el aviso del plan para ese hospital. Aprobar no acredita
una entrega real de agua ni calcula carreteras.

Validación automatizada reproducible: comandos de frontend/backend en README, con tests de
intervalos, históricos, procedencia, revisión y mapas. El recorrido de navegador fue una prueba
local; no se añadió un framework E2E al proyecto. No prueba Linux, NIM, carga sostenida ni
usabilidad con coordinadores reales.
