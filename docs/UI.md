# Interfaz web: decisiones y límites

Rediseño del 2026-10-17 del formulario ciudadano y del panel de coordinación (RNF09). No cambia
contratos, endpoints, autenticación, agentes, reglas de prioridad ni planificador: solo `frontend/`.

## Dirección

- Herramienta operativa para el coordinador y formulario sencillo para el ciudadano, con la misma
  identidad: un acento verde petróleo sobre neutros fríos, Public Sans autoalojada
  (`@fontsource-variable/public-sans`) e iconos Phosphor (`@phosphor-icons/react`) en lugar de emojis.
- Colores semánticos (ok, aviso, peligro) solo para estados. Modo claro y oscuro por
  `prefers-color-scheme`; las animaciones de entrada desaparecen con `prefers-reduced-motion`.
- Los valores de los contratos no cambian; `src/labels.ts` los traduce solo para la interfaz y
  muestra el valor original cuando no hay etiqueta.

## Vista ciudadana

Una sola pantalla con cuatro pasos numerados: lugar (distrito como filtro opcional y comunidad o
corregimiento del catálogo real de `/api/communities`), descripción, duración (mismos tramos de
horas que antes) y revisión en vivo antes de enviar. Se conservan la `Idempotency-Key`, el
reintento con el mismo cuerpo, «Cambiar mi reporte», el recibo con estado real y sondeo, el aviso
de llegada, la copia del código, la consulta por código y los ejemplos (solo en modo simulado).

## Panel de coordinación

- **Acceso:** comprueba el token contra un endpoint protegido antes de entrar y distingue token
  incorrecto (401) de servidor sin token configurado (503). El token sigue solo en memoria de React;
  si el servidor lo rechaza durante la sesión, vuelve al acceso con un aviso.
- **Resumen:** qué requiere atención (instituciones críticas, decisiones pendientes, análisis con
  error, plan por revisar, comunidades sin cobertura en el último plan) con acceso directo, y una
  cola «Revisar primero» ordenada por la alerta de institución crítica y la puntuación máxima que
  calculó el sistema. Las cifras indican sobre qué datos se calculan.
- **Reportes:** lista con lugar, puntuación o rango y alertas; ficha con lugar, tiempo indicado,
  estado del incidente, resumen, rango de prioridad dibujado como banda, factores con datos
  conocidos y sin confirmar, motivo, alertas y evidencia. La decisión humana usa opciones visibles,
  explica qué pasará y pide confirmación porque el backend no permite modificarla. Trazas, IDs y
  JSON siguen disponibles en «Detalles técnicos y auditoría».
- **Incidentes:** agrupación por lugar con historial unificado en un diálogo accesible.
- **Cisternas:** ciclo Calculado, Propuesto, Aprobado/Rechazado y «Entrega realizada» siempre
  pendiente, porque el sistema no la registra. Necesidad frente a lo programado, comunidades
  cubiertas y sin cubrir con su motivo (`SIN_UBICACION` explica que no se calcula ruta ni hora),
  comparación de impacto, rutas por cisterna y revisión del plan con confirmación.

## Funcionalidad conservada

Todas las llamadas de antes: `/health`, `/communities`, `POST /reports`, `/executions/{id}`,
`/reports/{id}/public-status`, `/admin/executions` (paginado), `/admin/executions/{id}`,
`POST /executions/{id}/resume`, `POST /executions/{id}/retry`, `/admin/incidents` (paginado),
`/admin/incidents/{id}/timeline`, `/admin/fleet`, `/admin/plans/latest`, `POST /admin/plans` y
`POST /admin/plans/{id}/review`. Los cuerpos enviados son los mismos; las pruebas de Vitest lo
comprueban.

## Limitaciones del backend (no modificadas)

- `GET /api/admin/executions` no incluye lugar, descripción ni puntuación. La interfaz pide el
  detalle de cada reporte listado (hasta 25 por página más los 25 recientes del resumen) y solo
  repite la consulta mientras el estado cambia. Un listado enriquecido evitaría estas peticiones.
- La API de administración no expone la descripción original de cada reporte; se muestra el
  resumen del incidente asociado. El tiempo sin agua indicado se obtiene de la línea de tiempo del
  incidente.
- El nombre del lugar se resuelve con los 100 incidentes más recientes (máximo de la API). Un
  reporte cuyo incidente es más antiguo muestra «Ubicación no disponible en esta vista».
- Los recuentos del resumen cubren los 25 reportes más recientes; no hay endpoint de totales.
- Los máximos por factor (35, 30, 20, 15) se toman de los valores por defecto de
  `PriorityPolicyConfig`; la API no los expone.
- Los 60 corregimientos del catálogo INEC no tienen coordenadas: el planificador los marca
  `SIN_UBICACION` y la interfaz no inventa rutas ni mapas.

Las capturas de `docs/evidence/` corresponden a la interfaz anterior.
