# Matriz de entrega del hackathon

Estado al 2026-10-17, contra la sección 6 (entregables) y la sección 2 (requisitos mínimos) de
[Retos_Hackathon_FISC_AI_Agents_2026.md](../Retos_Hackathon_FISC_AI_Agents_2026.md).
Solo se marca como hecho lo que tiene evidencia en el repositorio.

## Entregables (sección 6)

| Entregable | Estado | Evidencia / pendiente |
|---|---|---|
| Repositorio con commits durante el periodo | Hecho | Historial del 16 y 17 de octubre de varios integrantes, PR #2 integrado. El registro ante la organización en la hora 1 lo confirma el equipo |
| Tag `final-24h` | **Pendiente** | Se crea al final, con autorización explícita (ver abajo) |
| README | Hecho | Problema con fuentes, arquitectura de agentes, tecnologías, fuentes de datos, instalación, ejecución y credencial demo de `.env.example` |
| Diagrama de arquitectura | Hecho | [architecture.png](images/architecture.png) (fuente `architecture.mmd`) y diagramas de [ARCHITECTURE](ARCHITECTURE.md): agentes, herramientas, flujo y las dos aprobaciones humanas |
| Evals (≥ 15 casos, métrica y resultados) | Hecho | 54/54 escenarios en [cases.json](../evals/cases.json) y [results.json](../evals/results.json); impacto en [impact.json](../evals/impact.json); método en [EVALUATION](EVALUATION.md) |
| Bitácora de IA | Hecho | [AI_LOG](AI_LOG.md): herramientas, modelos, qué se hizo a mano y entradas por fase |
| Documento de metodología | Hecho | [METHODOLOGY](METHODOLOGY.md): metodología, funcionamiento, despliegue y límites |
| Video demo ≤ 3 min | No obligatorio según el equipo | La sección 6 del documento del reto lo lista; si se graba, enlazarlo arriba en el README |

## Requisitos mínimos (sección 2)

| Requisito | Estado | Evidencia |
|---|---|---|
| ≥ 3 agentes que se comunican | Hecho | Cinco agentes: ingesta, verificación, coordinación, planificador y comunicación (`agents.py`, `graph.py`) |
| Herramienta con acción real | Hecho | Escritura en base de datos, solver de cisternas y avisos por Telegram (`tools.py`, `planner.py`, `integrations/telegram.py`) |
| Componente determinístico | Hecho | Puntaje en `domain.py`, solver en `planner.py`, compuertas en `grounding.py` |
| Humano en el ciclo | Hecho | Aprobación de prioridad (interrupt/resume de LangGraph) y aprobación del plan, con razón |
| Trazabilidad | Hecho | Trazas por agente y herramienta, auditoría de decisiones, expediente en la interfaz |
| Evals propios | Hecho | 54 escenarios; 173 pruebas pytest y 14 Vitest |
| Guardrails | Hecho | [GUARDRAILS](GUARDRAILS.md): inyección, fuera de tema, datos inventados, candidatos inválidos |

## Verificación

| Comprobación | Estado |
|---|---|
| Pruebas locales | Backend 173 passed (87 % cobertura), evals 54/54, frontend 14/14, build |
| Instalación limpia desde el README | Hecha en F7 (ver AI_LOG) |
| Corrida real con NVIDIA NIM | F2-01 completo: 12 reportes a revisión en 166 s, plan y aviso al hospital ([AI_LOG](AI_LOG.md), [NVIDIA_SMOKE](NVIDIA_SMOKE.md)) |
| CI en GitHub Actions | **Por confirmar** en la pestaña Actions del último commit |

## Congelamiento

Solo al cumplirse el plazo oficial, después de revisar la documentación, y con autorización
explícita: confirmar el commit correcto, árbol limpio y CI verde. Luego el responsable ejecuta
`git tag -a final-24h -m "Entrega final hackathon"` y `git push origin final-24h`.
Cualquier commit posterior al tag se ignora en la evaluación. No reemplazar un tag existente.
