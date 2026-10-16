# Metodología, despliegue y funcionamiento

Se conserva el README oficial y la especificación aprobada D1–D7. Se trabaja incrementalmente sobre
el repositorio existente: contratos/persistencia → agentes/motor/worker → HTTP/HITL → UI → pruebas
y documentación. Ponytail full guía la simplicidad: un monolito modular, un worker y dos archivos
SQLite con responsabilidades distintas. No se introdujeron microservicios ni infraestructura futura.

Las decisiones relevantes están en ADRs. El único ajuste a la secuencia aprobada es el desacoplamiento
durable de HTTP descrito en ADR 001. La interfaz presenta simulación y datos sintéticos explícitamente.
El grafo decide por contratos; las reglas de prioridad son determinísticas, separadas del lenguaje.

## Operación local

Tres procesos: API, worker y Vite. SQLite negocio y checkpoints bajo `data/runtime` (ignorado por Git).
Aplicar migraciones y seed antes de arrancar. El seed es idempotente, no sobreescribe catálogo existente.
El worker procesa una ejecución a la vez; cambios se ven mediante polling. Si está apagado, HTTP acepta
reportes y revisiones durables, que permanecen en cola hasta arrancarlo. No es una cola distribuida.

Para un entorno posterior, servir `frontend/dist` y `/api` bajo el mismo origen, HTTPS y supervisor
de procesos con reinicio; persistir ambos archivos SQLite y mantener un solo worker. Vite es servidor
de desarrollo, no el despliegue público. No se configuró cloud ni despliegue automático.
Backup consistente: detener API y worker y respaldar todo `data/runtime`, incluidos WAL si existen.
Nunca recuperar solo negocio o solo checkpoints de instantes diferentes.

## Calidad y equipo

GitHub Flow con una tarea por rama/PR, revisión cruzada y CI. Esta sesión no realizó operaciones Git
de escritura ni acciones remotas. La guía práctica está en CONTRIBUTING y el reparto por roles en BACKLOG.
Pruebas unitarias, API, DB, LangGraph, contratos NIM simulados, procesos HTTP y componentes UI.
Las métricas de evals se generan ejecutando casos; no son un benchmark de inteligencia real.

Cada modificación futura actualiza requisito, contrato, implementación, prueba y documentación en
el mismo PR. Cambios que afecten ejecuciones pausadas requieren estrategia explícita de compatibilidad
del estado del grafo; no se despliega una topología incompatible sin decidir cómo terminar/migrar esos threads.
