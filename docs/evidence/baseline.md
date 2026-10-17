# Evidencia de Línea Base — Fase F0 (AguaIA)

**Fecha de ejecución:** 2026-10-16  
**Entorno:** Windows (PowerShell), Python 3.13.16, Node v22.18.0  
**Rama:** `main` (commit `f5f0dc5d6a78c25fb4545a66f1ccff8cd2c26d78` con integración previa de `feat`)  
**Estado:** Suite R0 ejecutada con desviaciones (ver sección 5): un fallo intermitente en pytest,
`npm ci` sustituido por `npm install` y Node 22 en lugar del Node 24 requerido. H6 y H11 comprobados
mediante scripts exploratorios, no mediante la prueba manual M0 completa.
**Actualización:** las desviaciones 1–4 se cerraron después (sección 6): causa de la intermitencia
identificada, `npm ci` en verde, Node 22 aceptado como entorno probado y M0 ejecutada con capturas.

---

## 1. Resultados de la Suite de Regresión R0 (F0-01)

### A. Backend

| Comando | Resultado | Métrica / Detalle |
| :--- | :--- | :--- |
| `uv sync --locked` | **OK** | 72 paquetes resueltos, 70 verificados |
| `uv run ruff check app tests migrations` | **PASS** | *All checks passed!* |
| `uv run ruff format --check app tests migrations` | **PASS** | 27 archivos formateados correctamente |
| `uv run mypy` | **PASS** | *Success: no issues found in 3 source files* (solo cubre contracts, domain y config) |
| `uv run pytest -q -p no:cacheprovider --cov=app` | **PASS en el 2.º intento** | 1.ª ejecución: falló `test_real_http_queue_and_worker_restart`. 2.ª ejecución: **75 passed** en 221.23s (3m 41s), cobertura total **87%**. Ver sección 5 |
| `uv run alembic upgrade head` + `check` | **PASS** | Esquema sincronizado (*No new upgrade operations detected*) |

#### Desglose de Cobertura Backend (87%):
- `app/agents.py`: 96%
- `app/api.py`: 85%
- `app/config.py`: 100%
- `app/contracts.py`: 99%
- `app/db.py`: 88%
- `app/domain.py`: 100%
- `app/graph.py`: 100%
- `app/models.py`: 100%
- `app/planner.py`: 100%
- `app/providers.py`: 97%
- `app/seed.py`: 74%
- `app/services.py`: 53%
- `app/tools.py`: 99%
- `app/worker.py`: 78%

### B. Evaluaciones Automáticas (`scripts/evaluate.py`)

- **Total:** 31 escenarios ejecutados en 40.26s.
- **Pass rate:** **100% (31/31 passed)**
- **Modo:** `mock-deterministic`
- **Métricas por categoría:**
  - `consolidation_scenarios`: 6/6
  - `guardrail_scenarios`: 10/10
  - `human_decision_scenarios`: 9/9
  - `planner_scenarios`: 9/9

### C. Validación de Datasets (`scripts/validate_datasets.py`)

- **Ubicaciones:** 20/20 validadas dentro del Bounding Box de Panamá Oeste (11 instituciones críticas, 3 plantas potabilizadoras, 6 referencias vernáculas).
- **Flota de cisternas:** 4 camiones cisterna verificados (2 ágiles de 3,000 gal y 2 pesados de 10,000 gal).
- **Integridad referencial y GeoJSON:** Exportación exitosa a `data/panama_oeste_locations.geojson`.
- **Inspección de git diff:** `git diff data/` = limpio (sin modificaciones accidentales, riesgo H13 controlado).

### D. Frontend

| Comando | Resultado | Detalle |
| :--- | :--- | :--- |
| `npm.cmd ci` | **FALLÓ** | No pudo reemplazar binarios de `node_modules` bloqueados por procesos Node en ejecución |
| `npm.cmd install` (sustituto, no es el paso de R0) | **OK** | 274 paquetes auditados, 0 vulnerabilidades; modificó `package-lock.json`, restaurado con `git checkout` |
| `npm.cmd run lint` | **PASS** | `eslint .` sin errores ni advertencias |
| `npm.cmd run typecheck` | **PASS** | `tsc --noEmit` completado exitosamente |
| `npm.cmd test` | **PASS** | **8 passed** (8 tests en `App.test.tsx`, 21.99s) |
| `npm.cmd run build` | **PASS** | Build de Vite completado en 6.64s (`dist/` generado) |

---

## 2. Comprobación Empírica de H6 (F0-02)

**Hipótesis:** `arraijan-demo` no posee coordenadas en `data/panama_oeste_seed.json`, por lo que el planificador clasifica la demanda como `SIN_UBICACION`. En contraste, una comunidad del catálogo con coordenadas (ej. `crit-hosp-nicolas-solano`) recibe asignación de rutas y cisternas.

### Salida de la Ejecución:
```
=== EJECUTANDO F0-02 (Prueba M0: arraijan-demo vs crit-hosp-nicolas-solano) ===
Total ubicaciones en catalogo: 20
arraijan-demo en catalogo: False
crit-hosp-nicolas-solano en catalogo: True

--- Resultado de Planificación ---
Rutas generadas: 3
  Camion: Cisterna Ágil Burunga 01 (ID: cisterna-burunga-01)
    Parada: Hospital Regional Nicolás A. Solano (crit-hosp-nicolas-solano) - Llegada: 06:54 - Galones: 3000
  Camion: Mega Cisterna Hospitalaria 01 (ID: cisterna-hospital-01)
    Parada: Hospital Regional Nicolás A. Solano (crit-hosp-nicolas-solano) - Llegada: 06:00 - Galones: 10000
  Camion: Mega Cisterna Troncal 02 (ID: cisterna-troncal-02)
    Parada: Hospital Regional Nicolás A. Solano (crit-hosp-nicolas-solano) - Llegada: 08:23 - Galones: 2000

Demandas No Atendidas: 1
  Comunidad: Arraiján Cabecera Demo (arraijan-demo)
    Motivo: SIN_UBICACION
    Detalle: El sector no tiene coordenadas en el catálogo geográfico; no se inventa una ubicación.

[OK] F0-02 verificado exitosamente.
```
**Método:** script exploratorio que llama directamente a `PlannerAgent`/`plan_distribution`
con demandas construidas en el script (por eso el nombre «Arraiján Cabecera Demo» no coincide con
el de `data/communities.json`). No se levantaron API, worker ni frontend: **la prueba manual M0
queda pendiente**. El script se eliminó tras ejecutarse; solo se conserva la salida de arriba.

**Conclusión H6:** Confirmado. Toda comunidad fuera de `panama_oeste_seed.json` queda retenida con motivo `SIN_UBICACION`, demostrando la necesidad de resolver F2-01 y F2-06 con sectores provistos de coordenadas.

---

## 3. Comprobación Empírica de H11 (F0-03)

**Hipótesis:** La función `stated_hours(text)` en `providers.py` utiliza la expresión regular `(?<![\d.-])(\d+(?:[.,]\d+)?)\s*horas?\b`, omitiendo unidades como «días» o «semanas». Si un LLM real o mock avanzado extrae `hours_without_water = 72.0` para el reporte *"Tenemos 3 días sin agua en el barrio"*, el chequeo de fundamentación en `Agents.ingest` detecta que `72.0 not in []` y lanza `ProviderError("UNGROUNDED_HOURS")`, culminando en estado `ERROR` en el worker.

### Salida de la Ejecución:
```
=== EJECUTANDO F0-03 (Confirmar H11: 3 días sin agua -> UNGROUNDED_HOURS) ===
Texto del reporte: 'Tenemos 3 días sin agua en el barrio'
Horas extraídas por stated_hours('Tenemos 3 días sin agua en el barrio'): []
Extracción del LLM: hours_without_water = 72.0
Excepción capturada durante el grounding: ProviderError('UNGROUNDED_HOURS')
[CONFIRMADO] Hallazgo H11 reproducido: stated_hours solo reconoce 'horas'. Ante '3 días', un LLM que extrae 72 causa UNGROUNDED_HOURS.
```
**Método:** script exploratorio con una extracción del LLM simulada (`hours_without_water = 72.0`);
no se usó el proveedor NVIDIA real. El script se eliminó tras ejecutarse.

**Conclusión H11:** Confirmado. Queda plenamente justificada la tarea **F1-04** para dotar a `stated_hours` de comprensión de días, semanas y cardinales.

---

## 4. Estado de la Decisión D-01 (F0-04)

- El árbol de trabajo se encuentra en la rama `main`, la cual ya integró previamente el trabajo de la rama `feat` (`merge: integrar rama feat a main con planificador de cisternas...`).
- Para las fases de desarrollo subsiguientes (**F1** en adelante), se adoptará la creación de ramas temáticas (`feat/f1-priority-core`, etc.) garantizando aislamiento y cumplimiento estricto de las directrices de `AGENTS.md`.

---

## 5. Desviaciones respecto al plan de F0

| # | Desviación | Impacto | Acción pendiente |
| :--- | :--- | :--- | :--- |
| 1 | La 1.ª ejecución de pytest falló en `test_real_http_queue_and_worker_restart` (`tests/test_process_e2e.py`); tras un diagnóstico con un script temporal, la 2.ª ejecución pasó. La causa no quedó determinada ni registrada | Prueba **intermitente**: puede fallar en F1 sin relación con los cambios | Ejecutar ese test 5 veces seguidas y registrar cuántas falla y con qué error, antes de cerrar F1 |
| 2 | `npm ci` falló (binarios bloqueados por procesos Node activos) y se sustituyó por `npm install` | El paso de R0 `npm ci` no está verificado | Cerrar los procesos Node y repetir `npm.cmd ci` |
| 3 | Node v22.18.0 en lugar de 24.19.0 (`.node-version`, README) | Los resultados del frontend no corresponden al entorno declarado | Repetir lint/typecheck/test/build con Node 24.19.0, o documentar Node 22 como soportado |
| 4 | F0-02 y F0-03 se hicieron con scripts exploratorios que luego se eliminaron, no con la prueba M0 (API + worker + Vite) | No hay evidencia de M0 ni scripts reproducibles | Ejecutar M0 con capturas; en adelante guardar los scripts exploratorios en `docs/evidence/` |
| 5 | mypy solo analiza 3 archivos | «0 errores» no cubre agentes, servicios ni API | Ninguna en F0; considerar en F6 |
| 6 | F0 se ejecutó directamente sobre `main`, que tiene cambios sin commitear (`docs/AI_LOG.md`, `evals/results.*`, `docs/evidence/`) | Contradice la estrategia de ramas de D-01 | Crear `feat/f1-priority-core` antes de empezar F1 y decidir si se commitea la evidencia de F0 |
| 7 | El commit `524e7d4` (posterior a la auditoría) amplió el vocabulario de tema en `guard_text` (`cortes`, `bombas`, `llaves`, `chorros`…) | Se solapa con F4-03 y puede aumentar los falsos aceptados («corte de pelo») | Medirlo en F4-02/F4-03; no añadir más palabras sin el corpus |

**Veredicto inicial de F0:** H6 y H11 confirmados; línea base condicional hasta resolver las desviaciones 1–4.
El estado final de cada desviación está en la sección 6.

---

## 6. Cierre de las desviaciones 1–4 (2026-10-16, Claude Code · Opus 5.5)

| # | Estado | Resultado |
| :--- | :--- | :--- |
| 1 | **Cerrada: causa identificada; prueba sigue intermitente** | Ver 6.1 |
| 2 | **Cerrada** | Con Vite detenido, `npm.cmd ci` terminó sin errores (273 paquetes, 0 vulnerabilidades) y **no modificó** `package-lock.json`. Tras la instalación limpia: lint OK, typecheck OK, Vitest **8/8**, build OK (10.60 s) |
| 3 | **Aceptada por decisión del equipo** | El equipo decidió no instalar Node 24. **Node v22.18.0 es el entorno probado**; `.node-version` (24.19.0) y el README siguen declarando Node 24 y CI usa 24.19.0. Esa incoherencia queda para F6 |
| 4 | **Cerrada** | M0 ejecutada por la interfaz real, con capturas y respuestas HTTP. Ver 6.2 |

### 6.1 Prueba intermitente `test_real_http_queue_and_worker_restart`

- 5 ejecuciones aisladas (`pytest tests/test_process_e2e.py -k test_real_http_queue_and_worker_restart`):
  **2 pasaron y 3 fallaron**, siempre con `AssertionError: El proceso no alcanzó el estado esperado en 15 segundos`
  (`tests/test_process_e2e.py:51`).
- Diagnóstico con el mismo flujo, plazo de 90 s y tiempos por etapa (script en el scratchpad de la sesión, fuera del repo), 3 ejecuciones:

  | Etapa | Ejec. 1 | Ejec. 2 | Ejec. 3 |
  | :--- | :--- | :--- | :--- |
  | API hasta `/api/health` 200 | 6.6 s | 10.8 s | 6.5 s |
  | worker 1 hasta `WAITING_APPROVAL` | 12.8 s | **33.1 s** | 13.3 s |
  | worker 2 hasta `APPROVED` | 13.0 s | **23.2 s** | 13.7 s |

- Los logs muestran que el procesamiento real tarda 0.2–0.4 s desde `worker_started`; el resto es el
  **arranque en frío del proceso worker** (importación de LangGraph y demás dependencias) en esta máquina.
- **Causa:** el plazo fijo de 15 s de `wait_until` es demasiado corto para el arranque del worker en Windows.
  No se observó ningún error de lógica: en todas las ejecuciones el flujo terminó en `APPROVED`.
- **Pendiente (no es código de aplicación, no se modificó en F0):** ampliar el plazo del test (por ejemplo a 60 s)
  o esperar a `worker_started` antes de contar. Se propone como primera tarea de F1, para que la puerta de
  salida de F1 no dependa de la suerte.

### 6.2 Prueba manual M0

**Entorno aislado:** API en 127.0.0.1:8010 y worker con base de datos y checkpoints temporales (scratchpad de la
sesión), `LLM_PROVIDER=mock`, token público de `.env.example`, y Vite en 127.0.0.1:5180 con una configuración
temporal fuera del repo (mismos plugins, proxy a 8010). La demo del equipo (8000/5173) y su base de datos no se usaron.

**Flujo ejecutado en el navegador:**
1. Reporte ciudadano en «Hospital Regional Nicolás A. Solano»: «El hospital está sin agua desde hace 18 horas,
   los tanques de reserva se están agotando», duración «Entre medio día y 1 día» (18 h).
2. Recibo con código y estado «Lo revisa el equipo» (WAITING_APPROVAL).
3. Coordinación: propuesta **68–68/100**, confianza ALTA, alerta de institución crítica y explicación del Agente 3.
4. Decisión APPROVE con motivo → RESUME_QUEUED → **APPROVED**, puntuación final 68.
5. Plan generado: **3 rutas, 15 000 de 15 000 galones (100 %)**, 0 demandas sin atender.
6. Plan aprobado con motivo → incidente **SCHEDULED**.

**Estados finales verificados por la API:** ejecución APPROVED (`mock-deterministic`), 18 trazas
(`api → worker → ingestion → verification → coordination → human → finalize`), plan APPROVED con 5 eventos
(`PLAN_REQUESTED, START, PLAN_PROPOSED, END, PLAN_REVIEWED`), incidente `crit-hosp-nicolas-solano` en SCHEDULED.

**Evidencia en `docs/evidence/m0/`:** `01-reporte-ciudadano.jpg` … `08-plan-aprobado.jpg`, y `execution.json`,
`plan.json`, `incidents.json`, `health.json`. Se comprobó que no contienen el token.

**Observaciones de M0 (no bloquean F0; candidatas para F2/F6):**
- La tarjeta de ejecución de la lista de Coordinación no aparece como elemento interactivo en el árbol de
  accesibilidad (no se puede abrir con teclado ni con lector de pantalla); hubo que hacer clic por coordenadas.
- El aviso de la decisión dice «Se validará formalmente la prioridad calculada (68 pts)»; con rango, ese número
  es `score_min` (H3c, F1-03).
- Durante la ventana en que se detuvieron la API y el Vite del equipo, otro proceso los relanzó (23:14) en 8000 y 5173.
  Por eso M0 se movió a 8010/5180. Al terminar se apagó solo la instancia M0; la demo del equipo quedó respondiendo.

**Veredicto final de F0:** desviaciones 1–4 cerradas (la 3, aceptada como Node 22). H6 y H11 confirmados y
M0 en verde. Para la puerta de salida de F1 queda abierto el arreglo del plazo de la prueba e2e (6.1).
