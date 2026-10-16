# Colaboración de tres integrantes

`main` debe permanecer ejecutable. No se configuraron protecciones ni tableros remotos en esta entrega.
Recomendación posterior: exigir CI y una revisión para integrar a `main`.

## Una tarea, una rama, un Pull Request

1. Selecciona una tarea en `docs/BACKLOG.md`; acuerda responsable y archivos afectados con el equipo.
2. Cuando el responsable autorice trabajar con Git: actualiza `main` con `git pull --ff-only`
   y crea `git switch -c feat/12-descripcion`. No lo hagas sobre cambios locales ajenos.
3. Usa prefijos `feat/`, `fix/`, `docs/`, `test/`, `chore/` y número de Issue cuando exista.
4. Implementa y prueba localmente. Revisa `git diff` y `git status` antes de añadir archivos.
   No incluyas `.env`, `.venv`, SQLite, `node_modules` ni resultados personales.
5. Haz commits pequeños: `feat: permitir resolver asociación tentativa`, por ejemplo.
6. Publica la rama y abre un PR solo cuando esté autorizado. Completa la plantilla, enlaza requisito
   y describe prueba/evidencia. Solicita revisión a otro integrante.
7. Integra cuando CI pase y la revisión esté resuelta. No crees `final-24h` antes del congelamiento.

Los comandos anteriores son una guía para el equipo; el asistente no los ejecutó.

## Evitar conflictos

Rol backend: API, servicios y migraciones. Rol agentes: contratos internos, reglas y evals.
Rol frontend: vistas, accesibilidad y contratos TS. Acuerden primero los cambios de `contracts.py`.
Una PR de contrato debe mostrar ejemplo JSON anterior/nuevo y consumidores afectados. Añadir campos
opcionales suele ser compatible; cambiar significado, tipos o nombres exige coordinación y pruebas
con frontend. No editen simultáneamente el mismo documento central sin avisar.

Sincroniza tu rama con `main` antes de revisar. Resuelve conflictos leyendo ambas versiones,
hablando con su autor y ejecutando regresiones; nunca uses una sobrescritura global para resolverlos.
No reescribas historial compartido ni fuerces un push sin acuerdo explícito.

## Definition of Done

- Criterios de aceptación implementados, con un caso negativo cuando hay un límite de confianza.
- Lint, tipos, pruebas y build pertinentes pasan; una prueba verifica lógica nueva no trivial.
- Migraciones aplican en base vacía y `alembic check` no encuentra deriva.
- OpenAPI/TS/fixtures/documentación y bitácora sincronizados; incertidumbre y simulación visibles.
- Sin secretos, accesos administrativos abiertos, acciones de DB no idempotentes ni trabajo ajeno borrado.
- Revisión humana solicitada; limitaciones y pasos de prueba concretos en la PR.

## Revisión práctica

Reproduce el caso del autor, sigue entrada → agente → herramienta → persistencia → UI.
Prueba una entrada inválida, un reintento y autorización. Comprueba que el 202 no ejecuta LangGraph
y que una revisión no despacha recursos. Señala errores concretos, no gustos de estilo.

## Organización de GitHub (configurar posteriormente)

Columnas: Backlog → Todo → In Progress → In Review → Done. Máximo una tarea activa por persona.
Etiquetas: `backend`, `agents`, `frontend`, `docs`, `security`, `evals`, `bug`, `priority:P0/P1/P2`,
`blocked`, `contract-change`, `size:S/M/L`. Plantillas locales en `.github/`.
