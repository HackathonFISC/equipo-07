# Demostración reproducible

Instalar y arrancar los tres procesos según README. Mantener `LLM_PROVIDER=mock` para una demo
offline reproducible; el banner y las explicaciones dicen que es simulación. Migración y seed
son acciones reales. No configurar una clave para ejecutar tests.

## Guion de máximo tres minutos

| Tiempo | Acción | Evidencia que mostrar |
|---|---|---|
| 0:00–0:20 | Presentar crisis de coordinación y alcance local | No es chatbot; sectores sintéticos visibles |
| 0:20–0:50 | Sector Arraiján; «Estamos sin agua desde hace 24 horas», horas 24 | POST guarda y muestra UUID; cola → revisión |
| 0:50–1:10 | Repetir con «No llega el agua desde hace 24 horas» | Dos reportes, un incidente consolidado en mock |
| 1:10–1:50 | Entrar en Coordinación con token local, abrir ejecución | Tres agentes, factores/rango 0–100, datos faltantes/sintéticos, trazas |
| 1:50–2:20 | CORRECT, 70, razón «Revisado para la demostración del equipo» | RESUME_QUEUED → APPROVED; puntuación humana aparte |
| 2:20–2:45 | Mostrar decisión persistida y auditoría | actor compartido, motivo, política, ninguna entrega confirmada |
| 2:45–3:00 | Mostrar resultados de evals y pendientes | Mock no prueba calidad de NIM; rutas/canales futuros |

Alternativas: «Hospital sin agua desde hace 24 horas» activa revisión inmediata; descripción genérica
«Consulta del agua disponible» termina NEEDS_INFORMATION. Aprobar acepta el límite inferior;
rechazar conserva auditoría y no cierra automáticamente un incidente con otros reportes.

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
