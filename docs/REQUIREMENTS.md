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
| RF12 | P1 | Recibir texto, fotos, audios/notas de voz y documentos por Telegram (polling) y WhatsApp Cloud API (webhook firmado); guardar de forma durable e idempotente; entregar a `submit_report` solo con sector y descripción explícitos; lo incompleto queda como borrador pendiente | Implementado local | `app/integrations`, test_integrations; Meta y Telegram reales no probados; MESSAGING |
| RF13 | P1 | Chatbot guiado en Telegram y WhatsApp: consentimiento, distrito, corregimiento (catálogo INEC 2023 verificado), barriada opcional, tipo, descripción, duración normalizada, evidencias y confirmación con corrección por campo; solo tipos soportados llegan a `submit_report` | Implementado local | `chatbot.py`, test_integrations; sin prueba con credenciales reales; MESSAGING |
| FUT02 | P2 | Transcripción de audio, interpretación de imagen, respuestas al ciudadano, predicción | Pendiente | Borradores PENDING listos para el agente multimodal |
| ENT01 | P0 | Repositorio registrado, historial oficial, tag, video ≤3 min | Pendiente de equipo | DELIVERY_CHECKLIST |

Para un requisito nuevo: asignar ID, describir aceptación, identificar módulos, acordar contrato,
crear tarea independiente, implementar, probar casos y regresiones, actualizar docs y abrir PR
cuando esté autorizado. Cambiar el estado solo con evidencia ejecutada.
