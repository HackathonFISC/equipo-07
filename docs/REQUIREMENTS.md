# Requisitos y trazabilidad

Estado se refiere a esta implementación local, no a entrega oficial ni despliegue público.

| ID | Prioridad | Criterio de aceptación | Estado | Evidencia / requisito oficial |
|---|---|---|---|---|
| RF01 | P0 | Validar, persistir y aceptar reporte con 202 sin ejecutar grafo | Implementado | API + test_process_e2e; herramienta real |
| RF02 | P0 | Tres agentes intercambian contratos por estado LangGraph | Implementado | agents.py, graph.py; multiagente |
| RF03 | P0 | Filtro sector/tiempo, HIGH definitivo, MEDIUM revisable, LOW nuevo | Implementado | E05–07, E18, E20, E22 |
| RF04 | P0 | Prioridad 0–100, factores, intervalo y versión sin LLM calculando | Implementado | domain.py y tests; componente determinístico |
| RF05 | P0 | Pausa durable, revisión protegida, aprobar/rechazar/corregir y reanudar | Implementado | E14–19, resilience; HITL |
| RF06 | P0 | Ver estados, prioridad, decisión y trazas desde UI | Implementado | Vistas React + tests de interacción |
| RF07 | P0 | Auditar agentes, herramientas, errores y decisión humana | Implementado | Trace técnico/audit + logs JSON |
| RF08 | P0 | Mock determinístico offline y adaptador NVIDIA configurable | Parcial | Mock probado; GPT-OSS-20B real vía NVIDIA hasta HITL. DeepSeek/Kimi sin inferencia satisfactoria en esta cuenta; NVIDIA_SMOKE |
| RF09 | P0 | ≥15 escenarios reproducibles con métricas medidas | Implementado | 22 casos + runner + resultados; evaluaciones oficiales |
| RNF01 | P0 | Guardrails de entrada, salida, escritura y autorización | Implementado | GUARDRAILS + pruebas negativas; alcance inicial |
| RNF02 | P0 | Cola sobrevive reinicios, sin duplicar efectos/revisiones | Implementado | Proceso separado, OS lock, tests de replay y restart |
| RNF03 | P1 | Migración a PostgreSQL sin reemplazar dominio | Parcial | ORM/SQL portable, saver factory; driver/migración operativa no probados |
| RNF04 | P0 | Instalación fijada, lint/tipos/tests/build sin claves pagadas | Implementado local | Lockfiles, comandos README; CI remoto pendiente de ejecución |
| RNF05 | P1 | Windows y Linux | Parcial | Verificado Windows; matriz CI Linux/Windows definida, no ejecutada remotamente |
| RNF06 | P1 | UI responsive, formularios etiquetados y errores visibles; vista ciudadana en lenguaje llano y WCAG 2.2 AA para todas las edades | Implementado | CSS responsive, HTML semántico y pruebas; auditoría experta en UX_AUDIT_CIUDADANO.md; prueba con usuarios pendiente |
| RNF07 | P0 | Colaboración GitHub Flow y contrato compartido | Implementado local | CONTRIBUTING, templates, BACKLOG; tableros remotos pendientes |
| RF10 | P0 | Agente planificador: a partir de incidentes priorizados por un humano, flota y ubicaciones, un solver determinístico asigna cisternas, horarios y galones (capacidad, turnos, acceso vial, recarga en planta) y explica cada asignación y cada demanda no atendida | Implementado | planner.py + PlannerAgent + worker; test_planner y E23–E26; planificador VRP |
| RF11 | P0 | El coordinador aprueba o rechaza el plan con razón; puede excluir cisternas no disponibles y regenerar; aprobar programa, no confirma entregas | Implementado | API protegida + PlanPanel; E27–E31 y prueba Vitest; HITL del plan |
| RF14 | P0 | Fundamentación lingüística: negación acotada sobre instituciones y parseo temporal (horas, días, semanas; «el/al medio día» no es duración; lo impreciso queda null con DURACION_IMPRECISA) sin errores de UNGROUNDED_HOURS | Implementado | grounding.py, providers.py, agents.py; test_grounding, E32, E33, E36–E38; F1-01 y F1-04 |
| RF15 | P0 | Criticidad unificada (D-02): Proposal y PlanDemand usan la misma regla; el catálogo geográfico es fuente con `category == "institucion_critica"` (salud, escuelas, asilos; nunca plantas) y el texto puede elevarla a crítica | Implementado | domain.py (`is_critical_location`, `resolve_criticality`), tools.py, agents.py; E34, E35, E40; F1-02 |
| RF16 | P0 | Aprobación con intervalo (D-03): cuando score_min ≠ score_max, APPROVE requiere approved_score explícito dentro del rango (422 si falta o está fuera); `association` sin asociación tentativa responde 409 | Implementado | contracts.py, services.py, CoordinationPage; E39, test_security_and_conflicts; F1-03 |
| RF17 | P0 | Agente de Comunicación determinístico: tras aprobarse un plan, genera exactamente 1 notificación por comunidad (SCHEDULED con hora más temprana y galones consolidados, o UNSERVED con motivo) con unicidad (plan_id, community_id) sin LLM | Implementado | models.py, agents.py, worker.py, test_communication.py; Agente 5 y migración Alembic 5ed0c1f96df0 |
| RF18 | P0 | Estado público del reporte con hora estimada: GET /api/reports/{report_id}/public-status expone estatus, estado del incidente y aviso de entrega si el incidente formó parte de un plan aprobado, sin filtrar trazas ni incident_ids | Implementado | contracts.py, api.py, services.py, test_communication.py, CitizenPage.tsx; endpoint seguro sin fuga de datos |
| RF19 | P0 | Línea de tiempo unificada por incidente: GET /api/admin/incidents/{id}/timeline (protegido con token) consolida cronológicamente trazas, revisiones, eventos del plan y avisos | Implementado | api.py, services.py, contracts.py, CoordinationPage.tsx, test_communication.py |
| RF32 | P0 | Procedencia de datos documentada: catálogo de fuentes, clasificación rigurosa (verificado, estimado, supuesto) y límites | Implementado | DATA_SOURCES.md, validación de datasets |
| RNF08 | P1 | Experiencia ciudadana accesible: consulta de estatus por código de reporte, visualización clara de la hora estimada, supuesto explícito de horario del mismo día y cese de polling en estados terminales | Implementado | CitizenPage.tsx, styles.css, App.test.tsx; consulta con UUID y tarjeta de aviso con ETA |
| RF30 | P0 | El seed hace upsert desde `data/communities.json`: los cambios de población, vulnerabilidad o nombre llegan a bases existentes sin borrar el SQLite y sin tocar reportes | Implementado | seed.py; test_seed.py; F3-02 |
| RF31 | P0 | Métrica de impacto: el mismo `plan_distribution` se ejecuta con el orden de AguaIA y con dos baselines (más reportes primero, orden de llegada) sobre un escenario declarado; reporta cobertura crítica, minutos hasta la primera entrega crítica y comunidades atendidas, y publica dónde AguaIA no mejora | Implementado | impact.py, scripts/impact_report.py → evals/impact.json; test_impact.py; F3-03 |
| FUT02 | P2 | WhatsApp, Telegram, audio, imagen, predicción | Pendiente | Interfaces futuras documentadas, sin integración ficticia |
| ENT01 | P0 | Repositorio registrado, historial oficial, tag, video ≤3 min | Pendiente de equipo | DELIVERY_CHECKLIST |

Para un requisito nuevo: asignar ID, describir aceptación, identificar módulos, acordar contrato,
crear tarea independiente, implementar, probar casos y regresiones, actualizar docs y abrir PR
cuando esté autorizado. Cambiar el estado solo con evidencia ejecutada.
