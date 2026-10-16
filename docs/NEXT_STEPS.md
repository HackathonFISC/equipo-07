# Próximos pasos: cómo empezar la siguiente fase

Guía práctica para el equipo, basada en [GAP_ANALYSIS](GAP_ANALYSIS.md), [ROADMAP](ROADMAP.md) y
[BACKLOG](BACKLOG.md). Pensada para un primer proyecto colaborativo con GitHub.
**Nada de esta guía se ejecutó en remoto**: los comandos de GitHub son para que el equipo los use
cuando lo autorice.

## 1. Reunión de arranque (30–45 min) — decisiones que solo el equipo puede tomar

| # | Decisión | Por qué bloquea | Resultado esperado |
|---|---|---|---|
| 1 | **Plazo oficial y hora de congelamiento** (`final-24h`) | Define si se aplica el corte «inminente» del ROADMAP | Fecha y hora escritas en DELIVERY_CHECKLIST |
| 2 | **Asignación de roles A/B/C** (§2) | Evita que dos personas toquen los mismos archivos | Tabla de §2 confirmada |
| 3 | **Autorización de acciones remotas** (Issues, Project, etiquetas, protección de `main`) | AG-10 y la creación del tablero | Una persona administra el repo |
| 4 | **Autorización de cuota NVIDIA** para la Fase 2 | AG-27 consume cuota | Límite y responsable |
| 5 | **Origen de `backend/config.py`, `backend/contracts.py`, `backend/domain/`** | AG-08 no puede borrar trabajo ajeno | Reclamar o eliminar |
| 6 | **Agendar ADR-002 (AG-14) y ADR-003 (AG-15)** | Desbloquean las fases 1 y 3 | Borradores en ≤ 1 día; aprobación de los tres |

## 2. Distribución inicial de trabajo (ajustable)

Los roles son áreas técnicas, no una evaluación de habilidades. La asignación por defecto sigue el
orden del README y **debe intercambiarse libremente** según interés y disponibilidad.

| Integrante | Rol inicial | Área principal | Primeras Issues | Revisa los PR de |
|---|---|---|---|---|
| Sebastián Feng (@MrFengH) | A — backend, datos y API | `api.py`, `services.py`, `models.py`, migraciones | AG-07 → AG-13 → AG-14 | Rol B |
| Cristian Muir (@iCrxisz) | B — agentes, IA y evals | `agents.py`, `graph.py`, `providers.py`, `worker.py`, `evals/` | AG-01 → AG-02 → AG-15 | Rol C |
| Mahmoud ElSayed (@Matimod55) | C — frontend, UX y demo | `frontend/src`, accesibilidad, DEMO, video | AG-12 → glosario C8 y maquetas → AG-18 | Rol A |

- Los PR de contrato (AG-13, AG-14, AG-15, AG-29) los revisan **los tres**.
- Las revisiones rotan para que todos conozcan las tres áreas.
- Una tarea activa por persona (CONTRIBUTING).

## 3. Primeras Issues recomendadas

**Primera ola (en paralelo, sin conflictos de archivos):**

| Rol | Issue | Archivos | Por qué primero |
|---|---|---|---|
| A | **AG-07** Alembic batch + head único (XS) | `migrations/env.py`, `ci.yml`, CONTRIBUTING | Bloquea toda migración futura; riesgo cero |
| A | **AG-13** Contrato C1: detalle con evidencia (S) | `contracts.py`, `services.py`, `api.py`, `types.ts` | Arregla la revisión «a ciegas» (D-07) y desbloquea la UI |
| B | **AG-01** Institución crítica con negación (S) | `providers.py`, `agents.py`, nuevo `grounding.py` | Defecto P0 verificado que altera prioridades y rompe el modo NIM |
| B | **AG-02** Duraciones en días/semanas sin ERROR (S) | `grounding.py`, `agents.py` | Mismo módulo que AG-01; prerrequisito de la evaluación real |
| C | **AG-12** Consistencia documental (XS) | README, NVIDIA_SMOKE, EVALUATION | Afirmaciones exactas ante el jurado |
| C | Glosario C8 y maqueta de bandeja (sin código) | — | Prepara AG-18 mientras se integra AG-13 |

**En paralelo, decisiones de diseño:** ADR-002 (AG-14) y ADR-003 (AG-15). Son documentos cortos;
el código viene después. Con ellos aprobados se desbloquea la ruta crítica:
AG-14 → AG-16/AG-18 → AG-29 → AG-30/31/32 → AG-33.

## 4. Configurar GitHub (cuando se autorice)

1. **Etiquetas** (una vez; requiere `gh auth login`):
   ```powershell
   gh label create "priority:P0" --color B60205; gh label create "priority:P1" --color D93F0B
   gh label create "priority:P2" --color FBCA04; gh label create "contract-change" --color 5319E7
   gh label create "adr" --color 0E8A16; gh label create "needs-authorization" --color 000000
   gh label create "size:XS" --color C5DEF5
   ```
   Crear también `backend`, `agents`, `frontend`, `docs`, `security`, `evals`, `blocked`,
   `size:S/M/L` y `phase:0`–`phase:6` si no existen.
2. **Project:** columnas Backlog → Todo → In Progress → In Review → Done; vista por `phase`.
3. **Issues:** crear solo la primera ola y los ADR (AG-01, 02, 07, 12, 13, 14, 15), no las 52 de golpe.
   Copiar el bloque de BACKLOG como cuerpo. El título incluye el ID interno: `AG-01 · Detectar institución crítica…`.
4. **Protección de `main`** (Settings → Branches): PR obligatorio, 1 aprobación, checks
   `backend (ubuntu-latest)`, `backend (windows-latest)` y `frontend` requeridos, sin push directo.
   Hacerlo solo después de confirmar que CI está verde (AG-10).
5. **Estrategia de integración:** «Create a merge commit». Conserva los commits de cada integrante,
   que sirven de evidencia de colaboración si se evalúa el historial (D-23). No reescribir historial
   publicado.

## 5. Flujo Git paso a paso (primer proyecto colaborativo)

```powershell
# 1. Partir de main actualizado (sin cambios locales pendientes)
git switch main
git pull --ff-only

# 2. Crear la rama de la Issue
git switch -c fix/AG-01-institucion-critica

# 3. Trabajar y verificar (desde backend; ver §6)
# 4. Revisar qué vas a subir: nunca .env, .venv, SQLite, node_modules ni data/runtime
git status
git diff

# 5. Commits pequeños con mensaje claro
git add backend/app/grounding.py backend/app/agents.py backend/tests/test_grounding.py
git commit -m "fix: detectar institución crítica aunque se niegue el agua (AG-01)"

# 6. Publicar y abrir el PR (o desde la web)
git push -u origin fix/AG-01-institucion-critica
gh pr create --fill --base main

# 7. Si main avanzó mientras trabajabas (forma segura para principiantes: merge, sin force-push)
git fetch origin
git merge origin/main
```

Reglas:
- Un conflicto se resuelve leyendo ambas versiones y hablando con su autor, nunca aceptando todo
  «lo mío».
- Nunca `git push --force` en ramas compartidas.
- Si dos PR traen migraciones, la segunda ajusta su `down_revision` antes de integrarse (AG-07).
- Un PR ideal tiene menos de ~400 líneas cambiadas y se revisa el mismo día.

## 6. Verificación local (comandos comprobados en esta auditoría)

> **Aviso:** el `.env` local de quien ejecutó la prueba NVIDIA tiene `LLM_PROVIDER=nvidia` con
> GPT-OSS-20B. Las pruebas automáticas no lo usan, pero **arrancar API y worker con ese `.env`
> envía cada reporte a NIM y consume cuota**. Para desarrollo, usar `LLM_PROVIDER=mock`. Cada
> integrante crea su propio `.env` a partir de `.env.example`.

Desde `backend/`:
```powershell
uv sync --locked
uv run ruff check app tests migrations
uv run ruff format --check app tests migrations
uv run mypy
uv run pytest -q -p no:cacheprovider --cov=app     # 53 passed el 2026-10-16
```

Desde `frontend/`:
```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test                                       # 6 passed
npm.cmd run build
```

Para comprobar migraciones **sin tocar la DB de demo**, apuntar a un archivo temporal:
```powershell
$env:DATABASE_URL = "sqlite+aiosqlite:///$env:TEMP/aguaia-check.sqlite"
$env:CHECKPOINT_PATH = "$env:TEMP/aguaia-check-cp.sqlite"
uv run alembic upgrade head; uv run alembic check
Remove-Item Env:DATABASE_URL, Env:CHECKPOINT_PATH
```

`python ../scripts/evaluate.py` reescribe `evals/results.*` (archivos versionados). Hasta que se
integre AG-06, no incluir esos cambios en PR normales (`git restore evals/results.json evals/results.xml`).

## 7. Ritmo de trabajo sugerido

- **Sincronización diaria de 15 min:** qué terminé, qué empiezo, qué me bloquea, qué contrato cambia.
- **Contrato antes que consumidores:** si una Issue necesita un campo nuevo, se pide en la Issue del
  contrato. El frontend trabaja con fixtures mientras tanto.
- **Bitácora de IA (requisito oficial):** cada PR hecho con ayuda de IA añade una entrada en
  `docs/AI_LOG.md` con la herramienta, qué se aceptó y **qué se modificó a mano**.
- **Definition of Done:** CONTRIBUTING, más REQUIREMENTS.md actualizado con el estado verificado.

## 8. Si el plazo es inminente

Aplicar el corte del [ROADMAP](ROADMAP.md#corte-de-entrega-final-24h):
1. AG-01, AG-02, AG-12;
2. AG-13 con un cambio mínimo de UI;
3. CI verde (AG-10);
4. **AG-49: video y checklist**.

No empezar la Fase 3 si no puede terminarse e integrarse antes del congelamiento. El tag
`final-24h` solo se crea con autorización explícita, sobre un `main` verde.

## 9. Recomendación concreta

Implementar primero, en paralelo:
- **AG-01 + AG-02** (rol B): defectos P0 verificados en guardrails;
- **AG-07 → AG-13** (rol A): base de migraciones y contrato de evidencia para la revisión humana;
- **AG-12** (rol C): documentación exacta.

Al mismo tiempo, redactar **ADR-002 (prioridad vigente por incidente)** y **ADR-003 (aprobación con
intervalo)**. Son las dos decisiones de las que depende el planificador de cisternas, el componente
más importante que falta.
