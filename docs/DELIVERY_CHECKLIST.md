# Matriz de entrega del hackathon

| Requisito/entregable | Estado real | Evidencia / pendiente |
|---|---|---|
| ≥3 agentes comunicados | Implementado/probado offline | agents.py + WorkflowState + evals |
| Herramienta con acción real | Implementado/probado | Persistencia SQLAlchemy de reportes, asociaciones y decisiones |
| Componente determinístico | Implementado/probado | domain.py, política v1.0.0-demo y tests |
| Humano en el ciclo | Implementado/probado | interrupt, token, Review, Command resume; proceso separado |
| Trazabilidad | Implementado/probado | Eventos technical/audit y vista UI |
| ≥15 evaluaciones y métricas | Implementado/probado en mock | 22 escenarios, results.json y EVALUATION |
| Guardrails | Implementado inicial/probado | GUARDRAILS y pruebas negativas; límites documentados |
| Repo oficial existente | Verificado localmente | `.git` y README del equipo; no se creó otro repo |
| Registro al inicio del periodo | No verificado | Confirmar con organizadores/equipo |
| Historial de commits oficial | Pendiente de equipo | No se hicieron commits en esta sesión |
| README y credencial demo no sensible | Completado localmente | README y .env.example; token público solo localhost |
| Diagrama de arquitectura | Completado | README, ARCHITECTURE e IMPLEMENTATION |
| Bitácora IA | Completada para esta sesión | AI_LOG; revisiones humanas pendientes |
| Metodología/despliegue/funcionamiento | Documentado | METHODOLOGY, README, DEMO |
| CI | Definido, comandos verificados localmente | Ejecución en GitHub aún pendiente |
| Prueba NVIDIA real | Verificada hasta HITL con GPT-OSS-20B | NVIDIA_SMOKE; aprobación humana de esa prueba pendiente, DeepSeek/Kimi no operativos en los intentos realizados |
| Video ≤3 minutos | Pendiente | Guion DEMO; no se grabó ni publicó |
| Tag final-24h | Pendiente al congelamiento | No creado |
| Revisión del equipo | Pendiente | No atribuir aprobación humana a revisión automática |

## Congelamiento cuando corresponda

Solo al cumplirse el plazo oficial, después de revisar resultados, documentación y video, y con
autorización explícita: confirmar rama/commit correcto, árbol limpio y CI verde. El responsable
puede crear `git tag -a final-24h -m "Entrega final hackathon"` sobre el último commit válido y
publicarlo con `git push origin final-24h`. Estos son pasos documentados, **no ejecutados**.
No reemplazar un tag existente ni adelantar el congelamiento. Confirmar reglas/fechas oficiales
con los organizadores: no se recibió documentación adicional que permita verificar el registro.
