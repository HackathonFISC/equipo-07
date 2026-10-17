# Demostración reproducible

Instalar y arrancar los tres procesos según README. Mantener `LLM_PROVIDER=mock` para una demo
offline reproducible; el banner y las explicaciones dicen que es simulación. Migración y seed
son acciones reales. No configurar una clave para ejecutar tests.

## Guion de máximo tres minutos

| Tiempo | Acción | Evidencia que mostrar |
|---|---|---|
| 0:00–0:25 | Presentar crisis de coordinación en Panamá Oeste y alcance local | No es chatbot; catálogo de referencia con coordenadas en La Chorrera y Arraiján (no son datos oficiales del IDAAN) |
| 0:25–0:50 | Cargar escenario reproducible desde `backend/`: `uv run python ../scripts/seed_demo_scenario.py` o enviar reporte desde `crit-hosp-nicolas-solano` («Sin agua en hospital desde ayer») | Ingesta 202 con UUIDv5 idempotente; Agente 1 valida y detecta institución crítica; cola → revisión |
| 0:50–1:20 | Abrir Coordinación con token local; revisar duplicados consolidados por Agente 2 | Agente 2 unifica reportes del mismo sector; Agente 3 calcula factores determinísticos 0–100 sin alucinación |
| 1:20–1:50 | Aprobar prioridad con intervalo (D-03): fijar puntaje dentro del rango y razón obligatoria | RESUME_QUEUED → APPROVED; trazabilidad inmutable y bandera `CRITICIDAD_CATALOGO` |
| 1:50–2:20 | Marcar `cisterna-hospital-01` como no disponible (el script no lo hace), generar el Plan de Cisternas (Agente 4, solver determinístico) y aprobarlo con razón | Rutas con paradas, galones y horarios explicados; incidentes pasan a `SCHEDULED` |
| 2:20–2:45 | Agente 5 Comunicación: consultar reporte ciudadano con UUID en `http://localhost:5173/` | Tarjeta de aviso con hora estimada de llegada («08:15»), galones asignados y leyenda de programación del mismo día |
| 2:45–3:00 | Mostrar línea de tiempo unificada del incidente (`GET /api/admin/incidents/{id}/timeline`) | Trazabilidad completa de punta a punta: reporte → deduplicación → prioridad → plan → notificación ciudadana |


Alternativas: «Hospital sin agua desde hace 24 horas» activa revisión inmediata; descripción genérica
«Consulta del agua disponible» termina NEEDS_INFORMATION. Si la propuesta tiene rango, Aprobar exige
fijar un puntaje dentro del rango (D-03; la UI propone el punto medio); rechazar conserva auditoría y no cierra automáticamente un incidente con otros reportes.

## Verificar antes de grabar

- API y worker usan la misma `.env`; una sola instancia worker y archivos distintos para checkpoints/negocio.
- Frontend alcanza `/api`; health muestra mock y comunidades se cargan desde DB.
- Token local coincide; endpoints administrativos rechazan ausencia de token.
- Suite/evals vigentes; no mostrar claves, datos personales ni consola con secretos.
- Ensayar duración ≤3 min; grabación/edición/publicación son tareas pendientes del equipo.

## Reinicio del worker y errores

Detén el worker en WAITING_APPROVAL y reinícialo: el thread y propuesta permanecen. También puedes
guardar una decisión con el worker detenido: queda RESUME_QUEUED hasta que vuelva a arrancar.
Si falla el proveedor, la consola muestra ERROR. Repara la configuración del mismo proveedor y usa
Reintentar; no se cambia automáticamente a mock ni se borra la ejecución.

La prueba `backend/tests/test_process_e2e.py` usa HTTP real y mata/reinicia solo los procesos que
ella crea, con archivos temporales. Comprueba el flujo sin tocar la demo del equipo.

## Reiniciar datos de demo conservando respaldo

Detén **API y worker** primero. Desde la raíz en PowerShell verifica la ruta y mueve el directorio
completo (incluye negocio/checkpoints/WAL) a un respaldo; nunca borres una ruta calculada desconocida:

```powershell
$workspace = (Get-Location).Path
$runtime = Join-Path $workspace 'data/runtime'
if ((Resolve-Path -LiteralPath $runtime).Path -ne $runtime) { throw 'Ruta inesperada' }
$backup = Join-Path $workspace ('data/demo-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Move-Item -LiteralPath $runtime -Destination $backup
Set-Location backend
uv run alembic upgrade head
uv run python -m app.seed
```

En Linux, desde raíz y con procesos detenidos: `mv data/runtime data/demo-backup-$(date +%Y%m%d-%H%M%S)`;
luego migrar y seed desde backend. El respaldo debe quedar fuera de Git; no contiene información
oficial. Para restaurar, detener procesos y restaurar **ambos** archivos de la misma copia.
