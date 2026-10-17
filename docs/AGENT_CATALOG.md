# Catálogo de agentes

Los agentes son responsabilidades operativas que interpretan/deciden con un proveedor y herramientas
limitadas. Un nodo es el punto de ejecución/replay de LangGraph. Una herramienta es una operación
controlada de servicio. El motor es código puro: no es un cuarto agente ni un LLM.

| Agente | Entradas → salidas | Estado | Herramientas permitidas | Condición/error/prueba |
|---|---|---|---|---|
| Ingesta | Texto + horas declaradas → NormalizedReportSchema | normalized | extract_report, save_normalized_report | Reporte aceptado; UNKNOWN termina NEEDS_INFORMATION. Horas no sustentadas fallan. E01–04, E09–12, E21 |
| Verificación | Normalized + sector → incidente/asociación | incident_id, association_status | candidate_incidents, evaluate_duplicate, consolidate_incident | Ingesta suficiente; candidatos inválidos fallan. E05–07, E18, E20, E22 |
| Coordinación | Reporte normalizado + catálogo → PriorityResult + explicación | priority | calculate_priority, explain_priority_proposal, persistir Proposal | Asociación definida; error de proveedor no genera aprobación. E08, E13–19 |
| Planificador | Incidentes PRIORITIZED + puntaje aprobado + flota + GeoJSON → PlanResult | DistributionPlan (fuera del grafo de reportes) | planning_inputs, plan_distribution (solver puro), save_plan | Solicitud del coordinador; sin LLM. Fugas, sectores sin coordenadas o sin demanda se explican como no atendidos. E23–31 |

Los agentes se comunican por `WorkflowState`; no se llaman unos a otros. `LLMProvider` tiene tres
métodos tipados. Mock y NVIDIA usan los mismos contratos, pero el origen de cada ejecución se
persiste: `is_simulated` y `provider`. No se permite convertir una ejecución de NIM en mock al reintentar.

`human_review` es un nodo sin mutaciones antes de `interrupt`, no un agente. `finalize` aplica la
revisión previamente autorizada. `worker` controla cola/errores/recuperación, no interpretación.

## Añadir un agente

1. Registrar requisito y tarea con entrada, salida, datos de origen y casos negativos.
2. Crear contrato Pydantic sin mezclar ORM; actualizar `WorkflowState` y sus consumidores.
3. Implementar lógica y únicamente herramientas autorizadas en `services`/`domain`.
4. Añadir nodo o subgrafo en `build_graph`; definir transición normal, insuficiencia y fallo.
5. Hacer efectos idempotentes. Añadir migración si necesita estado de negocio nuevo; checkpoints
   ya persisten estado de grafo. Documentar compatibilidad con ejecuciones pausadas existentes.
6. Añadir guardrails y pruebas de replay, contrato, errores, datos ausentes y autorización.
7. Agregar evals reproducibles y correr regresiones; actualizar este catálogo, Mermaid y README.
8. Revisar contrato con otro rol y enviar PR cuando esté autorizado.

El planificador corre en el mismo worker, después de la cola de reportes. `review_plan` es la
segunda intervención humana: aprobar marca incidentes SCHEDULED (programado, no entregado).

Futuros agentes (no implementados): geolocalización, comunicación, imágenes,
audio, predicción y auditoría avanzada. No necesitan un registro dinámico de plugins para añadirse.
