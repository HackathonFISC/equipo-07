# Backlog sugerido (sin Issues remotos creados)

Tamaños: S ≈ medio día, M ≈ 1 día, L ≈ 2–3 días. Son estimaciones para dividir trabajo, no compromisos.
Organizar en Backlog / Todo / In Progress / In Review / Done, una tarea activa por integrante.

| Tarea | Rol sugerido | P | Tamaño | Dependencias | Criterios de aceptación |
|---|---|---|---|---|---|
| B01 Verificación NIM con cuenta del equipo | Agentes/evals | P0 | S | Credenciales autorizadas | Ejecutar ambos modelos disponibles, registrar latencia/contratos/errores sin secretos ni fallback; conservar evidencia real separada |
| B02 Revisión operativa y contrato compartido | Backend | P0 | S | Demo local | Revisar dedupe/cola/HITL y OpenAPI con equipo; documentar cualquier cambio de contrato y pruebas |
| B03 Auditoría visual y accesibilidad | Frontend | P0 | S | Backend local | Recorrer reporte/aprobar/rechazar/corregir por teclado y móvil, comprobar errores/vacíos y grabar evidencia |
| B04 Ejecutar CI y preparar protección main | Backend | P0 | S | Autorización de acciones remotas | Workflows verdes en Windows/Linux, exigir checks/revisión cuando se autorice; no filtrar secretos |
| B05 Video ≤3 minutos y entrega oficial | Frontend + equipo | P0 | S | B01–B04 | Seguir DEMO; distinguir mock/real; revisar checklist, registro y ventana oficial; tag solo al final autorizado |
| B06 Corpus semántico y anotación humana | Agentes/evals | P1 | M | B01, datos autorizados | ≥30 pares anotados por humanos, precision/recall por sector/tipo, comparar modelos sin inventar métricas |
| B07 Validar catálogo de sectores y vulnerabilidad | Backend + dominio | P1 | M | Fuente oficial autorizada | Fuente/fecha/licencia documentadas, procedencia por campo, no mezclar sintético con confirmado |
| B08 Contrato mínimo de planificación | Backend | P1 | S | B02 y B07 | Definir incidentes aprobados, flota, capacidad/horarios y resultado; TS/fixtures acordados sin implementar rutas aún |
| B09 Agente planificador OR-Tools | Agentes | P1 | L | B08 | Plan factible con capacidades y límites, infeasibilidad explicada, tests y nuevo HITL antes de asignar |
| B10 Vista de flota y propuesta de plan | Frontend | P1 | M | B08; B09 para integrar | Consumo del contrato, estados reales, aprobación accesible y sin fingir despacho |
| B11 Identidad individual y retención | Backend | P1 | M | Requisitos de publicación | Roles, auditoría por persona, política de retención/PII y tests de acceso; retirar token demo público |
| B12 Canal ciudadano autorizado | Frontend/integraciones | P2 | L | B11 | Un canal real con consentimiento, dedupe de eventos externos y errores observables |
| B13 Aclarar módulos adicionales encontrados | Backend | P0 | S | Confirmar origen con equipo | Revisar config.py/contracts.py/domain fuera de app; conservar trabajo paralelo y consolidar contratos/política antes de importarlos; runtime probado usa app |

Primeras tareas paralelas: B02 en `backend/`, B01 en `providers.py`/`evals/`, B03 en `frontend/`.
Coordinar cambios a `contracts.py`, OpenAPI y tipos TS antes de editar; un PR de contrato precede
a PRs dependientes. Los responsables son roles para que el equipo distribuya según disponibilidad.
