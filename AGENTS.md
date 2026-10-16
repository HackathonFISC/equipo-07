# Instrucciones de trabajo

Lee `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION.md` y el README antes de modificar código.
D1–D7 son decisiones aprobadas. Monolito modular en este repositorio, no crear otro.

## Límites

- `backend/app/api.py`: validación HTTP, autenticación, aceptación durable; nunca invocar el grafo.
- `contracts.py`: contratos Pydantic; `domain.py`: prioridad pura; `models.py`: ORM independiente.
- `services.py`: transacciones, consultas controladas y auditoría; `agents.py`: responsabilidades operativas.
- `tools.py`: operaciones permitidas de persistencia para agentes; agentes no importan ORM ni sesiones.
- `graph.py`: estado, transiciones e interrupción; `worker.py`: ejecución recuperable, un proceso local.
- `providers.py`: Mock y NIM, sin acceso a DB ni herramientas del sistema.
- `frontend/src`: clientes, tipos, vistas; TanStack Query consulta HTTP, no tablas internas.
- `evals`: escenarios versionados y resultados producidos por ejecución real de pruebas.

## Cambios

1. Registra RF/RNF en `docs/REQUIREMENTS.md` y una tarea con criterios verificables.
2. Identifica módulos y consumidores afectados con `rg`; acuerda cambios de contratos antes de editar.
3. Actualiza Pydantic, OpenAPI, tipos TS, fixtures y tests juntos. Cambios incompatibles son explícitos.
4. Usa una migración Alembic para cambios de tablas; nunca editar una migración ya desplegada.
5. Implementa el mínimo cambio completo. Reutiliza componentes y servicios.
6. Ejecuta pruebas pertinentes; actualiza documentación, catálogo de agentes y bitácora.
7. Prepara PR según `CONTRIBUTING.md`, sin ejecutar operaciones Git no autorizadas.

Para añadir agentes sigue `docs/AGENT_CATALOG.md`. No mezcles agentes, nodos, herramientas
y motor determinístico. No incluyas efectos secundarios sin idempotencia alrededor de `interrupt()`.

## Comandos (desde backend / frontend respectivamente)

Backend: `uv sync --locked`, `uv run ruff check app tests migrations`,
`uv run ruff format --check app tests migrations`, `uv run mypy`,
`uv run pytest -q -p no:cacheprovider --cov=app`, `uv run alembic upgrade head`, `uv run alembic check`.
Evals: desde raíz `backend/.venv/Scripts/python.exe scripts/evaluate.py` (Windows),
`backend/.venv/bin/python scripts/evaluate.py` (Linux).
Frontend: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Seguridad y honestidad

No sobreescribas trabajo existente. No ejecutes comandos destructivos, commits, cambios de rama,
pushes, merges, tags ni acciones remotas sin autorización explícita. No crees Issues remotos.
No guardes secretos ni datos personales en fixtures/logs. Token solo en memoria React.
No silencie errores con fallback al mock. No atribuyas inferencia real al mock ni entregas de agua
a una aprobación. No inventes resultados, revisiones humanas, políticas oficiales ni geografía.
No cambies las siete decisiones sin documentar una contradicción real y su resolución mínima.
