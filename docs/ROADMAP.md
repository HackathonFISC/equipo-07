# Hoja de ruta

| Etapa | Estado | Salida y dependencias |
|---|---|---|
| Fundación | Implementada localmente | Monorepo, contratos, migraciones, locks, controles de calidad y documentación |
| Vertical slice | Implementado en demo | Tres agentes, cola durable, prioridad, HITL real y UI; pruebas descritas en EVALUATION |
| MVP del hackathon | Parcial | Validar NIM con credenciales, revisión humana, CI remoto, datos/contexto validado y video |
| Planificación de recursos | Pendiente | Contrato de flota/capacidad/horarios; OR-Tools + nuevo HITL; requiere datos confiables |
| Canales y geografía | Pendiente | Geolocalización, mapa, WhatsApp/Telegram, audios/imágenes; consentimientos e integraciones reales |
| Operación pública | Pendiente | Roles individuales, privacidad/retención, HTTPS, carga, backups y migración a PostgreSQL cuando haga falta |

Orden recomendado: verificar demo y NIM → revisar seguridad/datos → ejecutar CI y preparar video →
planificador mínimo con datos sintéticos → integrar una fuente real autorizada. No añadir predicción
antes de tener histórico y una métrica que justifique su utilidad.

Riesgos: falsa consolidación semántica, confusión entre datos sintéticos/reales, catálogo no validado,
disponibilidad/latencia de modelos, token compartido, pérdida de consistencia si se copian archivos
de DB activos por separado. Mitigaciones actuales y límites: GUARDRAILS y ADR 001.
