# Auditoría de usabilidad: Portal Ciudadano

Fecha: 2026-10-16 · Alcance: `frontend/src/pages/CitizenPage.tsx`, `App.tsx` (cabecera, banner, pie),
`components.tsx` (`ProcessStepper`, `StatusBadge`, `ErrorMessage`) y `styles.css`.

Métodos (skills en `.claude/skills/`): `nielsen-heuristics-audit`, `cognitive-walkthrough`,
`wcag-accessibility-audit` (objetivo WCAG 2.2 AA).

> Es una **evaluación experta sobre el código**, no una prueba con usuarios reales. No se ejecutaron
> axe/Lighthouse ni un lector de pantalla. Los contrastes se calcularon a partir de los colores del CSS.

## Resumen

La página está hecha para **explicar el sistema** (agentes, motor determinístico, NVIDIA NIM) y no para
**que una persona reporte que no tiene agua**. El formulario en sí es corto y correcto (3 campos), pero
está rodeado de jerga técnica, ejemplos de demo y texto pequeño. En móvil el formulario queda debajo
de toda la introducción. Después de enviar, el ciudadano recibe un UUID que se le pide "conservar",
pero no hay ningún lugar donde consultarlo.

| Severidad | Cantidad |
|---|---|
| 4 · Catastrófico | 0 |
| 3 · Mayor | 7 |
| 2 · Menor | 7 |
| 1 · Cosmético | 2 |

Lo que funciona bien: `lang="es"` y `<title>` correctos; etiquetas `<label>` visibles en todos los campos;
`aria-live` en el recibo; `Idempotency-Key` evita duplicados al reintentar; aviso explícito de no
enviar datos personales; los mensajes de error HTTP ya están en español.

## Hallazgos (ordenados por prioridad)

### Severidad 3 · Mayor

**1. Jerga técnica en toda la vista ciudadana** — H2 (lenguaje del mundo real), WCAG 3.1.5 (AAA)
- `CitizenPage.tsx:53-55` "prioridad determinística justa y verificable"; `:113-116` "Análisis Agéntico",
  "Motor Determinístico", "Supervisión Humana"; `:137` "flujo de coordinación multiagente";
  `:155` "sistema multiagente está normalizando"; `:159-160` "factores determinísticos".
- `components.tsx:88-90` el stepper dice "Ingesta y Deduplicación", "Motor determinístico 0-100".
- `App.tsx:56,60` banner: "DEMO OFFLINE", "Inferencia real mediante microservicios NVIDIA NIM (DeepSeek / Kimi)".
- **Recomendación:** dos registros de lenguaje. Para el ciudadano: "Recibimos tu reporte", "Lo estamos
  revisando", "Un coordinador lo está revisando", "Decisión tomada". Mover la explicación técnica a la
  vista de Coordinación o a un "¿Cómo funciona?" plegado.

**2. El formulario no es lo primero que se ve** — H8 (diseño minimalista), cognitive walkthrough Q2
- `CitizenPage.tsx:49-123`: eyebrow + titular + párrafo + 6 chips + 4 pasos + aviso **antes** del formulario.
- `styles.css:691-692`: bajo 960 px la rejilla pasa a una columna, así que en un celular el formulario
  queda varias pantallas más abajo.
- **Recomendación:** formulario arriba (o primero en móvil con `order`), una frase de introducción
  ("Avísanos si no tienes agua. Toma 1 minuto."), y el resto plegado o al final.

**3. Ejemplos de demo mezclados con el flujo real** — H5 (prevención de errores)
- `CitizenPage.tsx:58-110`: seis botones que rellenan el formulario con casos ficticios (hospital, escuela).
  Una persona puede pulsar uno pensando que es una categoría y enviar un reporte falso de un hospital.
- **Recomendación:** mostrarlos solo en modo demo (`health.is_simulated`) y con una etiqueta visible
  "Datos de ejemplo". En producción, sustituir por botones de **tipo de problema** que solo preseleccionan
  la categoría: "No sale agua", "Sale poca agua", "Hay una fuga".

**4. El código de reporte no sirve para nada al ciudadano** — H6 (reconocer en vez de recordar), H1
- `CitizenPage.tsx:144-148`: UUID largo "Conserva este código para verificar el estado…", sin botón de
  copiar y **sin ninguna pantalla para consultarlo**. Si se cierra la pestaña se pierde el seguimiento.
- **Recomendación:** botón "Copiar código"; consulta de estado por código (requiere endpoint público de
  solo lectura — es cambio de contrato, ver AGENTS.md); o eliminar la frase si no se va a ofrecer.

**5. Mensajes de estado que no dicen qué hacer** — H9 (ayudar a recuperarse de errores)
- `:152` "Espera a que el procesador tome el reporte" (¿qué procesador?).
- `:170` ERROR: "El coordinador puede revisar el error y reintentar el análisis" — no dice si el
  ciudadano debe hacer algo.
- `:167` NEEDS_INFORMATION pide enviar un reporte nuevo, pero no ofrece botón ni conserva lo escrito.
- `:173` APPROVED: "La prioridad fue registrada. Esto no confirma una entrega de agua." — confuso para
  quien solo quiere saber si llega la cisterna.
- **Recomendación:** cada estado = qué pasó + qué sigue + si debes hacer algo. Ej. ERROR: "Tu reporte
  quedó guardado. Hubo un problema al revisarlo; el equipo lo reintentará. No necesitas enviarlo otra vez."
  NEEDS_INFORMATION: botón "Completar mi reporte" que recupere comunidad y descripción.

**6. Texto pequeño y de bajo contraste** — WCAG 1.4.3 (AA), público de edad avanzada
- `--text-light: #94a3b8` sobre blanco ≈ **2.6:1** (mínimo 4.5:1). Se usa en `.char-count`
  (`styles.css:198`), `.step-content small` (`:347`) y el lema del pie (`:688`).
- Tamaños de 10–12 px: `.step-content small` 10 px, `.eyebrow` 11 px, `.char-count` 11 px,
  `.quick-title` 12 px, `.chip-btn` 12.5 px; campos y botones a 14 px.
- **Recomendación:** base de 16 px (campos y botones 16–18 px), nada por debajo de 14 px;
  `--text-light` a `#64748b` o más oscuro.

**7. El paso de "horas sin agua" pide un cálculo** — H2, cognitive walkthrough Q3
- `CitizenPage.tsx:263-275`: `input type="number"` con `step="0.5"` y máximo 2160. La gente cuenta en
  días ("desde el lunes"), no en horas.
- **Recomendación:** opciones grandes tipo botón: "Menos de 1 día", "1 a 2 días", "Más de 2 días",
  "No sé", que se traducen a horas en el cliente (24/48/72/`null`). El contrato del backend no cambia.

### Severidad 2 · Menor

**8. Indicador de foco casi invisible** — WCAG 2.4.7 (AA), 1.4.11
- `styles.css:192-196`: `outline: none` y sombra al 15 % de opacidad. Navegando con teclado apenas se
  ve dónde estás. **Recomendación:** `:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }`
  para campos, botones y chips.

**9. El stepper no comunica el paso actual a lectores de pantalla** — WCAG 1.3.1, 4.1.2
- `components.tsx:102-117`: `div` con `aria-label` sin rol; el paso activo solo se distingue por color.
  **Recomendación:** `<ol>` con `aria-current="step"` y texto "(paso actual)" / "(completado)".

**10. Dos botones confusos tras un fallo de envío** — H4, H3
- `CitizenPage.tsx:283` "Reintentar el mismo reporte" y `:296` "Editar como un nuevo reporte".
  **Recomendación:** "Intentar de nuevo" (principal) y "Cambiar mi reporte" (secundario), con una línea
  que explique que no se duplicará.

**11. Validación de descripción sin pista previa** — H5, WCAG 3.3.2
- `minLength={8}` sin indicarlo; el contador "0/2000 caracteres" añade ruido sin ayudar.
  **Recomendación:** quitar el contador hasta acercarse al límite; texto de ayuda "Cuéntanos con tus
  palabras qué pasa" asociado con `aria-describedby`.

**12. La pestaña "Coordinación" está al mismo nivel que "Reportar"** — H8
- `App.tsx:33-44`: un ciudadano puede entrar y encontrarse una pantalla de token. **Recomendación:**
  enlace discreto "Acceso para coordinadores" en el pie.

**13. Sin ayuda ni alternativa** — H10, WCAG 3.2.6 (A)
- No hay "¿Necesitas ayuda?" ni qué hacer en una emergencia sanitaria. **Recomendación:** bloque de
  ayuda fijo con el canal oficial que el equipo confirme (no inventar teléfonos).

**14. Lista de 23 comunidades sin búsqueda** — H7
- `CitizenPage.tsx:213-243`: agrupada por distrito (bien), pero hay que conocer el nombre oficial del
  sector. **Recomendación:** mantener el `<select>` nativo (es el más accesible) y añadir texto de ayuda
  "Si no ves tu barriada, elige la más cercana". A futuro, buscador o "Usar mi ubicación".

### Severidad 1 · Cosmético

**15.** `CitizenPage.tsx:50` eyebrow "PANAMÁ OESTE · RETO 1 AGUA" y pie con "Hackathon FISC" (`App.tsx:67,147`):
contexto del concurso, no del usuario. Mantener solo en modo demo.

**16.** `button:disabled { opacity: 0.55 }` (`styles.css:215`) baja el contraste del texto; añadir el motivo
("Cargando comunidades…") junto al botón deshabilitado.

## Recorrido cognitivo

**Persona:** María, 68 años, vive en una parte alta de Arraiján, usa un celular Android, lee bien pero con
letra pequeña le cuesta; no sabe qué es "IA" ni "agentic". **Tarea:** avisar que lleva dos días sin agua.

| # | Acción | Q1 sabe qué hacer | Q2 lo encuentra | Q3 entiende el control | Q4 ve progreso |
|---|---|---|---|---|---|
| 1 | Abrir la página | ⚠️ titular inspirador, no dice "reporta aquí" | — | — | — |
| 2 | Llegar al formulario | ⚠️ | ❌ está debajo de intro, chips y pasos (#2) | — | — |
| 3 | Elegir comunidad | ✅ | ✅ | ⚠️ debe conocer el nombre del sector (#14) | ✅ |
| 4 | Describir el problema | ✅ | ✅ | ✅ placeholder claro | ⚠️ contador de caracteres confunde |
| 5 | Horas sin agua | ⚠️ "opcional" | ✅ | ❌ convertir 2 días a 48 h (#7) | ✅ |
| 6 | Enviar | ✅ | ✅ | ✅ | ✅ "Guardando…" |
| 7 | Entender la respuesta | ❌ "flujo multiagente", "análisis agéntico" (#1) | — | — | ⚠️ stepper técnico |
| 8 | Volver mañana a ver el estado | ❌ | ❌ no existe dónde (#4) | — | — |

Puntos de fallo: **paso 2** (puede abandonar en móvil o pulsar un chip de ejemplo, #3), **paso 5** y
**pasos 7-8**. Es una predicción experta; validar con 3-5 personas mayores reales antes de cerrar decisiones.

## Estado

Aplicados (2026-10-16): pasos 1 a 5 del plan. Hallazgos resueltos: #1, #2, #3, #5, #6, #7, #8, #9, #10, #11, #12, #16;
parcial: #4 (copiar código, sin consulta de estado). Pendientes: #13, #14, #15 (pie aún menciona el hackathon).

## Plan de cambios sugerido

Solo frontend, sin cambios de contrato (orden de impacto/esfuerzo):

1. Reescribir textos ciudadanos en lenguaje llano (#1, #5, #10) y stepper simplificado.
2. Reordenar: formulario primero; intro corta; chips de demo solo con `is_simulated` (#2, #3).
3. Tipografía 16 px base, contraste, `:focus-visible` (#6, #8, #16).
4. Selector de duración en días (#7).
5. Botón "Copiar código" (#4, parcial) y "Acceso para coordinadores" en el pie (#12).

Requieren acuerdo de contrato o de equipo: consulta pública de estado por código (#4) y canal oficial
de ayuda (#13). Según AGENTS.md, registrar los RF/RNF en `docs/REQUIREMENTS.md` antes de implementar.
