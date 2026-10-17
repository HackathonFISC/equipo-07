# Interfaz web: decisiones y límites

Rediseño e integración del 2026-10-17 del formulario ciudadano y Coordinación (RNF09, RF40,
RNF11 / AG-52). Se adoptan en TS los campos aditivos existentes de AG-41; no se cambian contratos
del servidor, endpoints, autenticación, agentes, reglas de prioridad ni planificador.

## Dirección

- Herramienta operativa para el coordinador y formulario sencillo para el ciudadano, con la misma
  identidad «agua clara»: superficies en blanco cálido sobre una neblina aqua, turquesa para
  gráficos y el verde azulado profundo solo en botones y texto de acción (tokens en
  `styles.css`; texto ≥ 4,5:1, bordes de campos y gráficos ≥ 3:1). Public Sans autoalojada
  (`@fontsource-variable/public-sans`) e iconos Phosphor (`@phosphor-icons/react`) en lugar de emojis.
- Colores semánticos (ok, aviso, peligro) solo para estados. Modo claro y oscuro por
  `prefers-color-scheme`; las animaciones de entrada desaparecen con `prefers-reduced-motion`.
- Los valores de los contratos no cambian; `src/labels.ts` los traduce solo para la interfaz y
  muestra el valor original cuando no hay etiqueta.

## Vista ciudadana

Una sola pantalla con cuatro pasos numerados: lugar (distrito como filtro opcional y comunidad o
corregimiento del catálogo real de `/api/communities`), descripción, duración y revisión en vivo.
Duración envía LT_12H / H12_24 / H24_48 / GE_48H, o null para «No lo sé»; nunca horas representativas
ni simultáneas. Los ejemplos de demostración también usan intervalos. Se aclaran los límites:
12 h inicia H12_24, 24 h inicia H24_48, 48 h inicia GE_48H. Se conservan la `Idempotency-Key`, el
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
- **Reportes / Vista operativa:** lugar y distrito, descripción original, duración declarada,
  estado del incidente, banda de puntuación propuesta (o aplicada con su propuesta original),
  datos faltantes y acción requerida. Una sola zona reúne las advertencias relevantes. «¿Por qué
  se propone esta prioridad?» despliega hasta dos aportes conocidos con su dato y procedencia;
  el desglose completo está en Auditoría. No aparecen barras por cada factor ni párrafos libres
  de IA. Evidencia plegable, disponible también en Auditoría. La revisión humana conserva
  aprobar/corregir/rechazar, razón y confirmación. El rango empieza sin valor elegido, sin promedio
  sugerido; HTML exige entero dentro de min/max antes de registrar APPROVE.
- **Auditoría:** pestaña principal visible y botón junto a Vista operativa en cada reporte.
  Selección, filtro y formulario se conservan al alternar ambas vistas. Índice de anclas para
  Cronología, Datos, Puntuación, Evidencia, Decisión y Planes. Recorrido visual con nodos que
  realmente tienen trazas; cronología completa con agente/nodo, evento, herramienta, categoría,
  marca temporal, errores/estado resultante y JSON por evento. Muestra intentos y proveedor/modelo
  registrado, declaración frente a normalización, snapshot y procedencia por factor, puntos,
  fórmula v1.0.0-demo, propuesta almacenada, flags, asociación y evidencia orientativa.
  No llama al modelo ni expone razonamiento privado. Historial unificado y enlaces a planes
  registrados en el mapa; IDs y UTC bajo demanda. No se exportan token ni payload_hash.
- **Decisiones:** revisión recibida, pendiente de aplicar, aplicada y procesamiento con error
  están diferenciados. `applied_at` acredita aplicación aunque falle después el workflow;
  `final_score` se muestra separado del valor elegido y del rango original. Rechazar esta propuesta
  no borra prioridades de otros reportes; aprobar un duplicado programado no lo devuelve a pendiente.
- **Incidentes:** agrupación por lugar con historial unificado en un diálogo accesible, conservado.
- **Cisternas:** ciclo Calculado, Propuesto, Aprobado/Rechazado y «Entrega realizada» siempre
  pendiente, porque el sistema no la registra. Necesidad frente a lo programado, comunidades
  cubiertas y sin cubrir con su motivo (`SIN_UBICACION` explica que no se calcula ruta ni hora),
  comparación de impacto, rutas por cisterna y revisión del plan con confirmación.

- **Mapa** (solo coordinación, mismo token): dos capas. *Reportes e incidentes* colorea los 57
  corregimientos con polígono COD-AB en cuatro clases de igual intervalo (más «sin reportes»),
  alterna reportes e incidentes distintos, filtra por periodo (24 h, 7 y 30 días, todo) y estado del
  incidente, y lista todos los corregimientos con actividad, incluidos los que no tienen polígono.
  *Cisternas* elige un plan: plantas (cuadrados), entregas por color de cisterna, números de visita
  al elegir una cisterna, no atendidas con contorno rojo y el corregimiento resaltado cuando la
  comunidad no tiene punto. Una propuesta se dibuja con trazo discontinuo. No se dibujan líneas: la
  ruta vial figura como «No calculada» (`NO_CALCULADA`). La pestaña Cisternas enlaza al plan en el
  mapa. SVG propio con proyección equirectangular; sin teselas ni servicios externos, por eso funciona
  sin conexión. La lista acompaña al mapa como alternativa por teclado y lector de pantalla.

## Funcionalidad conservada

Todas las llamadas de antes: `/health`, `/communities`, `POST /reports`, `/executions/{id}`,
`/reports/{id}/public-status`, `/admin/executions` (paginado), `/admin/executions/{id}`,
`POST /executions/{id}/resume`, `POST /executions/{id}/retry`, `/admin/incidents` (paginado),
`/admin/incidents/{id}/timeline`, `/admin/fleet`, `/admin/plans/latest`, `POST /admin/plans` y
`POST /admin/plans/{id}/review`, `/admin/plans`, `/admin/map/activity`, `/admin/map/boundaries`
y `/admin/map/plans/{id}`. Solo cambia el envío ciudadano al campo aditivo duration_bucket;
los cuerpos de decisiones y planes se conservan. Navegación por teclado con flechas/Home/End;
en móvil las seis pestañas se ven en dos filas, incluido Mapa y Auditoría.

## Compatibilidad histórica y configuración

Sin report o inputs no se reconstruyen declaraciones/procedencia ni se usa población del catálogo
actual para explicar una propuesta antigua. Los puntos se conservan; se indica «Entrada no
registrada». Las horas históricas podrían ser representativas: no se deduce el intervalo original.
Explicaciones almacenadas sin inputs se abren con advertencia «Texto histórico sin validar».
No tener factores desconocidos significa que el motor tuvo valores, no que todos estén verificados.

Vite lee API_PROXY_TARGET desde la terminal o frontend/.env.local, con ejemplo versionado y
8000 como valor predeterminado consistente con el README. El navegador continúa usando /api
del mismo origen. La prueba con proxy usó un puerto dinámico distinto a 8000/8001. No hay fallback
a datos de demostración cuando falla un endpoint.

Comprobación del equipo durante AG-52: coexistían dos APIs, 8000 sin duration_bucket/endpoints
nuevos y 8001 con el contrato actualizado. Se creó frontend/.env.local ignorado por Git apuntando
a 8001, sin sobrescribir un archivo existente ni detener esos servicios del usuario. El valor
versionado por defecto sigue el arranque documentado; otras instalaciones deben configurar su
destino. Reiniciar Vite para recoger cambios de entorno.

## Limitaciones del backend (no modificadas)

- `GET /api/admin/executions` no incluye lugar, descripción ni puntuación. La interfaz pide el
  detalle de cada reporte listado (hasta 25 por página más los 25 recientes del resumen) y solo
  repite la consulta mientras el estado cambia. Un listado enriquecido evitaría estas peticiones.
- `detail.report` ahora resuelve descripción, duración y lugar directamente; para históricos sin
  ese campo se usa el ID de la instantánea o el lookup de 100 incidentes. El estado del incidente
  fuera de ese lookup se indica ausente, aunque se conozca el lugar.
- Los recuentos del resumen cubren los 25 reportes más recientes; no hay endpoint de totales.
- La fórmula descriptiva corresponde exclusivamente a v1.0.0-demo (35/30/20/15). Para otra
  versión se muestran los factores persistidos y se indica que su fórmula no está publicada en UI.
- El historial unificado busca los últimos 20 planes y 50 avisos; la ausencia no demuestra que
  nunca existió un plan. Sin trazas no se inventan etapas, resultados de validación ni transiciones.
- Los 60 corregimientos del catálogo INEC no tienen coordenadas puntuales: el planificador los
  marca `SIN_UBICACION`; el mapa resalta su polígono cuando existe y no inventa un punto ni rutas.

## Verificación AG-52

Frontend: lint, typecheck, 30 Vitest y build. Backend: 196 pytest (88 %), Ruff, formato, mypy;
una sola cabeza Alembic e7a4c2d9b610, upgrade/check y migraciones con datos históricos en bases
temporales. Sin migrar ni sobrescribir las bases locales.

Chrome sin interfaz: envío de LT_12H → LangGraph → rango 17–67 (9 pts de duración, 8 de población;
catálogo sintético temporal de 2630 habitantes y vulnerabilidad null) → revisión con 42 → pausa
del worker de prueba para ver «Pendiente de aplicar» → reinicio → aplicada una sola vez.
También plan propuesto/aprobado, 3 asignaciones de cisternas, un sector sin ubicación, mapa de
reportes, flota y aviso ciudadano. Proveedor mock explícito; ninguna inferencia NVIDIA real.
1440×1100 y 390×844, claro/oscuro, movimiento reducido y sin desbordamiento horizontal en las
vistas móviles comprobadas; sin errores JavaScript ni HTTP en el recorrido final.
Capturas y resultado estructurado: [evidence/ag52](evidence/ag52/README.md). Las otras capturas
de evidence son históricas. Prueba con usuarios, revisión humana y accesibilidad experta pendientes.
