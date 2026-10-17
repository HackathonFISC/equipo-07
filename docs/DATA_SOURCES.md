# Procedencia y gobernanza de datos en AguaIA

Documento de referencia para la procedencia de datos, clasificación de fuentes, cifras de contexto y límites del sistema para el Reto 1 (Agua — Panamá Oeste).

---

## 1. Resumen

- **Dato con fuente:** población de Arraiján y La Chorrera según el Censo 2023 (vía Wikipedia, cita el INEC), existencia de 2 instituciones de salud y 2 plantas potabilizadoras, y un comunicado del IDAAN sobre una suspensión en Laguna Alta.
- **Estimación:** coordenadas aproximadas por el equipo, sin fuente citada, para ubicar los lugares y calcular distancias relativas.
- **Supuesto de demo:** Poblaciones y demandas volumétricas en galones asignadas a comunidades y centros en los datasets de prueba, composición mecánica y operativa de la flota de cisternas (caudal, tiempos de servicio y recarga, consumo), pesos del algoritmo de priorización (35/30/20/15) y factores cinemáticos del solver (velocidad urbana de 30 km/h y tortuosidad 1.4).

---

## 2. Tabla de fuentes consultadas y verificadas

Todas las fuentes de esta tabla corresponden a páginas consultadas en vivo durante la sesión del 17 de octubre de 2026, donde el dato citado aparece de manera literal:

| ID | Dato | Valor citado | URL | Institución | Fecha de consulta |
|---|---|---|---|---|---|
| F01 | Población del Distrito de Arraiján | 299 079 habitantes (Censo 2023) | https://es.wikipedia.org/wiki/Distrito_de_Arraij%C3%A1n | Wikipedia (fuente secundaria; cita el Cuadro 10 del INEC) | 2026-10-17 |
| F02 | Población del Distrito de La Chorrera | 258 221 habitantes (Censo 2023) | https://es.wikipedia.org/wiki/Distrito_de_La_Chorrera | Wikipedia (fuente secundaria; cita el INEC) | 2026-10-17 |
| F03 | Suspensión de operaciones en Planta Potabilizadora de Laguna Alta (Arraiján) por trabajos del IDAAN | Suspensión programada de 12 horas (8:00 a.m. a 8:00 p.m., 10 de junio de 2024) por mantenimiento y cambio de medidores; sectores afectados: Nuevo Chorrillo, Burunga, Vista Alegre, Cerro Silvestre, Nuevo Emperador, Chapala | https://www.telemetro.com/nacionales/el-idaan-informa-que-la-planta-laguna-alta-suspendera-operaciones-n5987878 | IDAAN / Telemetro Reporta | 2026-10-17 |
| F04 | Existencia y atención de la Policlínica «Dr. Blas Daniel Gómez Chetro» (CSS) en Arraiján | Unidad ejecutora de salud de la CSS en Arraiján para una población de ~300 mil habitantes, derivando atenciones mayores al Hospital Regional Nicolás A. Solano | https://www.panamaamerica.com.pa/provincias/evaluan-la-situacion-de-la-policlinica-de-arraijan-1245515 | Caja de Seguro Social (CSS) / Panamá América | 2026-10-17 |
| F05 | Existencia, capacidad y rol regional del Hospital Regional Nicolás A. Solano (La Chorrera) | Hospital regional construido por el MINSA con capacidad de 250 camas de hospitalización, destinado a la atención de los distritos de La Chorrera, Arraiján, Capira, Chame y San Carlos | https://www.panamaamerica.com.pa/provincias/inauguran-hoy-el-nicolas-solano-45241 | Ministerio de Salud (MINSA) / Panamá América | 2026-10-17 |
| F06 | Ubicación y captación de agua cruda de la Planta Potabilizadora Jaime Díaz Quintero (El Trapichito) | Toma de agua cruda sobre la cuenca del río Caimito en el sector de El Trapichito, La Chorrera | https://www.panamaamerica.com.pa/provincias/rio-caimito-en-la-chorrera-sufre-desastre-ambiental-1260989 | Panamá América (prensa) | 2026-10-17 |
| F07 | Población por corregimiento de Panamá Oeste (60 corregimientos, 5 distritos) | `data/panama_oeste_corregimientos.json` (`population_2023`) | https://www.inec.gob.pa/archivos/P0705547520240202082406Panam%C3%A1%20Oeste.pdf | INEC, Censos 2023, Cuadro 3 (declarado en el archivo; pendiente de abrir por el equipo) | 2026-10-16 |

| F08 | Límites de corregimientos de Panamá Oeste (`data/panama_oeste_corregimientos.geojson`) | 57 de los 60 corregimientos del INEC 2023, con P-code (PA11xxxx). Faltan Burunga, Cerro Silvestre y Vacamonte: la capa conserva 6 corregimientos en Arraiján | https://data.humdata.org/dataset/cod-ab-pan (archivo `pan_admin_boundaries.geojson.zip`, capa admin3) | OCHA/HDX, COD-AB v01; HDX declara como origen www.gadm.org y licencia CC BY-IGO 3.0 | 2026-10-17 |

Fuente primaria del censo, citada por F01 y pendiente de abrir para confirmar las cifras:
INEC, «Superficie, población y densidad de población en la República según provincia, comarca,
distrito y corregimiento. Censos de 2000 a 2023», Cuadro 10:
https://www.inec.gob.pa/archivos/P0705547520231109105354CUADRO%2010.pdf. Citar el INEC como fuente
en el pitch solo después de comprobar el cuadro.

---

## 3. Tabla de procedencia por grupo de campos

Procedencia detallada de cada campo utilizado por el motor de cálculo de prioridad (`backend/app/domain.py`) y el planificador logístico determinístico (`backend/app/planner.py`, `backend/app/contracts.py`):

### 3.1. Comunidades (`data/communities.json`)

| Campo | Tipo | Fuente / Justificación |
|---|---|---|
| `population` (sectores demo) | SUPUESTO | Valores ilustrativos fijados por el equipo (1,800 en `arraijan-demo`, 2,500 en `chorrera-demo`, `null` en `sector-sin-censo`) para validar la ponderación demográfica y el manejo de datos incompletos. |
| `population` (instituciones y referencias) | SUPUESTO | Estimaciones del equipo sobre ocupación de camas, matrícula escolar o plantilla operativa en demostración (ej. 350 en hospital, 400 en policlínica, 2,200 en escuela, 100 en potabilizadoras); no representan censos oficiales internos de esas entidades. |
| `vulnerability` | SUPUESTO | Factor adimensional entre 0.0 y 1.0 modelado por el equipo para reflejar condiciones socioeconómicas o de criticidad operativa en la prueba (ej. 0.95 para hospitales/asilos, 0.70 para Arraiján demo, 0.30 para potabilizadoras). |
| `is_synthetic` | PARCIAL | `true` para los sectores demostrativos creados por el equipo; `false` para lugares que se presentan como reales. Solo hay fuente de existencia para el Hospital Nicolás A. Solano (F05), la Policlínica Blas Gómez Chetro (F04), la planta de El Trapichito (F06) y la planta de Laguna Alta (F03). Las demás escuelas, centros de salud, asilos y referencias (`ref-*`) no tienen fuente citada. En todos los casos, sus cifras son supuestos. |

### 3.2. Ubicaciones geográficas (`data/panama_oeste_seed.json` y `data/panama_oeste_locations.geojson`)

| Campo | Tipo | Fuente / Justificación |
|---|---|---|
| `coordinates` (`lat`, `lng`) | ESTIMADO | Coordenadas de referencia aproximadas para el marco geográfico de Panamá Oeste (bounding box: lat [8.8500, 9.0500], lng [-79.8600, -79.6300]) para cálculo de distancias relativas y renderizado en mapa; no provienen del catastro oficial georreferenciado del IDAAN. |
| `category` | PARCIAL | La categoría `institucion_critica` o `planta_potabilizadora` corresponde a la naturaleza real del lugar en los cuatro casos con fuente (F03–F06); en el resto es una clasificación del equipo. La categoría `referencia_vernacula` es una modelación del equipo para representar puntos de orientación ciudadana comunes. |
| `estimated_daily_demand_gallons` | SUPUESTO | Cuotas de demanda diaria hipotéticas asignadas para la simulación del balance de agua (ej. 15,000 gal para el hospital, 9,000 gal para la policlínica, 1,500–6,000 gal para escuelas y comunidades). |
| `road_access.max_tanker_capacity_gallons` | SUPUESTO | Restricción vehicular vial asignada por el equipo (3,000 gal para sectores quebrados o de loma; 10,000 gal para avenidas principales o instituciones con acceso amplio) para probar las restricciones del solver. |
| `vulnerable_population_count` | SUPUESTO | Conteo aproximado de población especialmente vulnerable (pacientes, ancianos, infantes) formulado por el equipo como parámetro de demostración. |

### 3.3. Flota de camiones cisterna (`data/tanker_fleet.json`)

| Campo | Tipo | Fuente / Justificación |
|---|---|---|
| `capacity_gallons` | SUPUESTO | Capacidad nominal asignada por el equipo para dos clases de vehículos: 3,000 galones (cisternas ágiles de dos ejes 4x2 para lomas y calles angostas) y 10,000 galones (tractocamiones cisterna pesados 6x4 para suministro masivo a instituciones y vías principales). |
| `discharge_flow_rate_gpm` | SUPUESTO | Tasa de descarga teórica de bombeo (150 gpm para bombas centrífugas de 2 pulgadas; 300 gpm para motobombas de alto caudal Camlock de 3–4 pulgadas) para computar tiempos de servicio en parada. |
| `refill_time_minutes` | SUPUESTO | Tiempo estimado de recarga en planta potabilizadora base (20 min para 3,000 gal; 35 min para 10,000 gal). |
| `setup_and_coupling_time_minutes` | SUPUESTO | Tiempo de maniobra, acople y desacople de mangueras Camlock estimado por el equipo (10 min en cisternas ágiles; 15 min en cisternas pesadas). |
| `fuel_consumption_km_per_gal` | SUPUESTO | Consumo medio estimado para transporte diésel de carga pesada en Panamá (6.0–6.2 km/gal para cisterna ágil; 3.7–3.8 km/gal para cisterna pesada). |
| `turnos` (`shift_hours`) | SUPUESTO | Turnos operativos de 8 horas (matutino 06:00–14:00, vespertino 14:00–22:00, matutino temprano 05:00–13:00, diurno central 08:00–16:00) establecidos como supuestos de planificación para ventanas de tiempo. |

### 3.4. Parámetros del planificador (`backend/app/contracts.py`)

| Campo | Tipo | Fuente / Justificación |
|---|---|---|
| `speed_kmh = 30` | SUPUESTO | Velocidad media de desplazamiento asumida en vías urbanas y semiurbanas de Panamá Oeste para vehículos de carga pesada con detenciones operativas. |
| `tortuosity = 1.4` | SUPUESTO | Factor multiplicador sobre la distancia Euclidiana directa para aproximar la distancia real de viaje por la red vial sinuosa y lomas de Panamá Oeste. |

### 3.5. Parámetros del motor de prioridad (`backend/app/domain.py`)

| Campo | Tipo | Fuente / Justificación |
|---|---|---|
| Pesos 35 / 30 / 20 / 15 | SUPUESTO | Ponderaciones porcentuales aprobadas como política de demostración de AguaIA (35 % tiempo sin agua, 30 % criticidad de la institución, 20 % factor de vulnerabilidad, 15 % volumen demográfico); no constituyen una resolución ministerial ni criterio normativo oficial del IDAAN o MINSA. |

---

## 4. Cifras de contexto para el pitch

Únicamente cifras documentadas en la Tabla 2:

1. **299,079 habitantes en Arraiján** ([F01]), según el Censo 2023.
2. **258,221 habitantes en La Chorrera** ([F02]), según el Censo 2023.
3. **557,300 habitantes entre los dos distritos** ([F01] + [F02]): es la suma de las dos cifras
   anteriores, el área que cubre el catálogo de AguaIA.
4. **Hospital Regional Nicolás A. Solano con 250 camas de internamiento** ([F05]): Es el hospital público regional de referencia del MINSA en La Chorrera, encargado de la atención de pacientes de los distritos de La Chorrera, Arraiján, Capira, Chame y San Carlos.
5. **Policlínica de Arraiján para unos 300 mil habitantes** ([F04]): la Policlínica «Dr. Blas Daniel Gómez Chetro» de la CSS deriva los casos mayores al Hospital Regional Nicolás A. Solano.
6. **Un solo corte afecta a varios sectores a la vez** ([F03]): el IDAAN anunció la suspensión de la planta de Laguna Alta por 12 horas el 10 de junio de 2024, con efectos en Nuevo Chorrillo, Burunga, Vista Alegre y Cerro Silvestre, sectores que también aparecen en el catálogo.
7. **Captación en el río Caimito** ([F06]): la planta Jaime Díaz Quintero (El Trapichito) toma el agua cruda del río Caimito.

---

## 5. Discrepancias identificadas

1. **Marcado `is_synthetic: false` frente a cifras ficticias en comunidades:**
   - En `data/communities.json`, las entidades institucionales y referencias reales (`crit-*`, `ref-*`, `pot-*`) están marcadas con `"is_synthetic": false`. Sin embargo, los campos numéricos asociados (`population`, `vulnerability`) corresponden a supuestos de demostración y no a auditorías institucionales oficiales. La marca `is_synthetic: false` solo certifica la existencia física de la entidad en Panamá Oeste, no la validez estadística de sus métricas operativas internas.
2. **Capacidad de camas frente a población del Hospital Nicolás A. Solano:**
   - En `data/communities.json` y `data/panama_oeste_seed.json`, el hospital registra una `population` y `vulnerable_population_count` de 350. La fuente institucional histórica del MINSA ([F05]) señala 250 camas de hospitalización. El valor de 350 del repositorio es un supuesto sin fuente; no se debe presentar como ocupación real ni compararlo con las camas.
3. **Redondeo demográfico en comunicaciones de salud frente al censo oficial:**
   - La cobertura institucional sobre la policlínica de Arraiján ([F04]) menciona una población de «aproximadamente 300 mil habitantes». El Censo oficial de 2023 ([F01]) precisa 299,079 habitantes. Ambos datos son coherentes a nivel macro, pero evidencian el uso de cifras redondeadas en declaraciones públicas.

---

4. **Puntos del catálogo frente a los límites COD-AB (F08):**
   - Al cruzar las coordenadas estimadas de `panama_oeste_locations.geojson` con los polígonos, 8 de
     20 puntos caen en un corregimiento distinto del que declaran. Ejemplos: el Hospital Nicolás A.
     Solano (declara Playa Leona, cae en Puerto Caimito), la planta de Laguna Alta (declara Nuevo
     Emperador en Arraiján, cae en El Arado, La Chorrera) y la Loma de Burunga (cae en Arraiján
     cabecera porque la capa no separa Burunga). El mapa cuenta los reportes en el corregimiento
     declarado y rotula los puntos como «ubicación aproximada»; las coordenadas no se corrigieron
     porque no hay fuente verificada para hacerlo.
5. **Capa de límites desactualizada en Arraiján (F08):** la capa tiene 6 de los 9 corregimientos
   del INEC 2023. Burunga, Cerro Silvestre y Vacamonte quedan `SIN_GEOMETRIA`: sus reportes se
   cuentan y listan, pero no colorean ningún polígono. Se evaluó geoBoundaries (STRI 2012, CC BY 4.0),
   que incluye Burunga y Cerro Silvestre pero tampoco tiene Vacamonte ni atributos de distrito, y
   OpenStreetMap, que en esta zona solo tiene nodos de poblado y no polígonos de corregimiento. No se
   mezclan fuentes ni se dibujan polígonos a mano.

## 6. Límites y alcance de evaluaciones

1. **Datos no verificables con fuentes institucionales abiertas:**
   - No se encontraron en esta búsqueda un catastro hidráulico, telemetría de caudales ni datos abiertos del IDAAN sobre la distribución con cisternas en Panamá Oeste.
   - `css.gob.pa` respondió HTTP 403 y no se citó; en su lugar se usó prensa nacional.
   - No se dispone de un manual oficial de ponderación de prioridad aprobado por el IDAAN para emergencias; los pesos 35/30/20/15 son una propuesta algorítmica de coordinación asistida.
2. **Interpretación de `evals/impact.json`:**
   - Las métricas (cobertura de la demanda crítica, minutos hasta la primera entrega crítica y comunidades atendidas) comparan órdenes de atención sobre el escenario de `data/demo_scenario.json`, con demandas, flota y velocidades que son supuestos. Indican el efecto relativo de la priorización, no tiempos reales.
   - El planificador no usa red vial: estima distancias en línea recta × 1.4. El mapa del plan
     (`road_routing: NO_CALCULADA`) muestra asignación y orden de visitas, nunca trayectos.
   - Ningún resultado del evaluador o del solver debe extrapolarse como una medición de impacto operativo en la red física real del IDAAN ni como una validación de rutas reales de transporte público.
