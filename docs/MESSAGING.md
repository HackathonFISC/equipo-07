# Chatbot ciudadano por Telegram y WhatsApp

El chatbot vive en `backend/app/integrations/`. Guía al ciudadano paso a paso, guarda cada mensaje
de forma durable y, al confirmar, entrega el reporte al mismo `submit_report` del formulario web
(reporte + ejecución `QUEUED`). El webhook y el receptor nunca ejecutan el grafo: lo hace el
worker de siempre. No hay transcripción ni respuestas generadas por IA. Las **fotos** sí se analizan: el worker
pide a `NVIDIA_VISION_MODEL` una frase de descripción y si se relaciona con el agua, y el
coordinador lo ve en el expediente como dato orientativo (no cambia tipo, horas ni puntaje; el
prompt prohíbe describir personas, caras, placas o documentos).

**Estado de los canales:** Telegram es el canal de la demo. WhatsApp está implementado y probado
solo con eventos simulados: sin una cuenta Meta Business verificada no se pudo conectar, así que
con las variables `WHATSAPP_*` vacías el webhook responde 403 y el canal queda apagado.

**Aviso de vuelta (Telegram):** cuando el coordinador aprueba un plan, el Agente de Comunicación
genera el aviso de cada comunidad y el receptor de Telegram lo envía al ciudadano cuyo reporte
cubre, con su código. Se envía una vez por reporte y aviso; si el envío falla se reintenta en la
siguiente vuelta del receptor (cada ≤10 s).

## Flujo de la conversación

1. **Inicio y consentimiento** (`/start`, «Hola» o cualquier primer mensaje): saludo, qué hace
   AguaIA, para qué se usan los datos y opciones «Acepto y comenzar» o «Cancelar». No se pide
   nombre ni cédula.
2. **Distrito**: Arraiján, Capira, Chame, La Chorrera o San Carlos.
3. **Corregimiento**: solo los del distrito elegido.
4. **Barriada o referencia**: texto libre de hasta 120 caracteres, un **punto de referencia** del
   catálogo geográfico (p. ej. «Supermercados Rey Vista Alegre») u «Omitir». Los corregimientos
   del INEC no tienen coordenadas y el planificador los marca `SIN_UBICACION`; elegir un punto de
   referencia asigna el reporte a ese lugar, que sí puede recibir una cisterna. Solo se ofrecen
   referencias vernáculas, nunca instituciones, para que un vecino no herede la criticidad de un
   hospital. No se piden coordenadas.
5. **Tipo de problema**: No hay agua, Baja presión, Fuga de agua u Otro problema.
6. **Descripción**: texto libre. Un audio sin texto se guarda sin transcribir, el borrador queda
   marcado `missing: ["transcription"]` y el bot pide una descripción escrita.
7. **Duración**: «12 horas», «2 días», «una semana», «hace 3 días» o «No sé». Solo se acepta un
   número (o un/una) con su unidad, hasta 90 días. Lo ambiguo («desde ayer», «3») se vuelve a
   preguntar y nunca se adivina.
8. **Evidencias**: fotos, notas de voz, audios o documentos, varios si se quiere; «Listo,
   continuar» u «Omitir». Se aceptan archivos en cualquier paso posterior al consentimiento.
9. **Confirmación**: resumen con distrito, corregimiento, barriada, tipo, descripción, duración y
   número de archivos. «Confirmar», «Corregir» (elige un solo dato, lo cambia y vuelve al resumen;
   al cambiar el distrito pide de nuevo el corregimiento) o «Cancelar».

En cualquier momento, «cancelar» cancela el borrador y «Hola», «/start» o «reiniciar» empiezan de
nuevo. Una conversación sin actividad durante 24 h se reinicia en el siguiente mensaje. Cada
conversación puede iniciar como máximo 5 reportes por hora: el bot envía desde el servidor y el
límite por IP del formulario web no le aplica.

Cada opción se elige tocando el botón o escribiendo su número o su texto. En Telegram las opciones
salen como teclado de respuesta. En WhatsApp, hasta 3 opciones cortas usan botones, hasta 10 usan
una lista, y más de 10 (los corregimientos de Capira, Chame y La Chorrera) se muestran como lista
numerada en el texto.

Al confirmar se envía a `submit_report` con el ID del borrador como Idempotency-Key,
`community_id` = corregimiento, `hours_without_water` = duración normalizada (o null) y la
descripción compuesta «<Tipo>. <descripción> Barriada o referencia: <barriada>.». El bot responde
«Código de seguimiento: <report_id>» con el ID completo del reporte guardado, el mismo que muestra
el formulario web y que acepta `GET /api/executions/<id>`. Solo lo envía cuando el reporte ya
existe.

Si `submit_report` falla, el borrador sigue `CONFIRMED` con todas sus respuestas y la petición
devuelve 5xx. Meta reintenta el mismo evento (en Telegram, el offset no avanza); el reintento
completa el envío con la misma clave y entonces sí manda el código, sin duplicar el reporte. Si el
corregimiento no existe en la base (falta `app.seed`), el borrador pasa a `PENDING` con
`missing: ["community"]`, conserva sus respuestas y el ciudadano sabe que aún no tiene código.
«Otro problema» no corresponde a ningún tipo del backend, así que queda `PENDING` con
`missing: ["kind"]` y no se crea incidente.

### Tipo de problema: cambio de contrato pendiente

El tipo elegido nunca se pierde: queda en `inbound_drafts.fields.kind` (`outage`, `low_pressure`,
`leak` u `other`, el valor de `NormalizedReportSchema.kind` en minúsculas) junto al `report_id`, y
encabeza la descripción. Pero hoy el pipeline puede contradecirlo: `ReportInput` no tiene campo de
tipo y `Agents.ingest` lo clasifica solo a partir del texto. Con el proveedor mock, «No hay agua.
La tubería está rota…» se clasifica como `LEAK` y «Baja presión. Hay una fuga cerca…» también.
Para evitarlo hace falta un cambio que no pertenece a este módulo y no se hizo aquí:

1. `contracts.ReportInput`: campo opcional `declared_kind: Literal["OUTAGE", "LOW_PRESSURE",
   "LEAK"] | None`.
2. `models.Report`: columna `declared_kind` con su migración, creada después de `d2b6f8a4c1e7`.
3. `Agents.ingest` (del otro desarrollador): si hay `declared_kind`, usarlo como `kind`; si el
   texto apunta a otro tipo, añadir una bandera, por ejemplo `CONTRADICCION_TIPO`, para la
   revisión humana.
4. Mensajería: pasar `declared_kind=fields["kind"].upper()` en `chatbot.report_input` (una línea)
   y añadir una prueba.

## Catálogo de distritos y corregimientos

`data/panama_oeste_corregimientos.json`: 5 distritos y 60 corregimientos tomados del INEC, Censos
Nacionales 2023, Cuadro 3 de Panamá Oeste «según distrito, corregimiento y lugar poblado»
([PDF](https://www.inec.gob.pa/archivos/P0705547520240202082406Panam%C3%A1%20Oeste.pdf)),
consultado el 2026-10-16. Verificación: en cada distrito, la suma de la población de sus
corregimientos coincide con el total distrital del Cuadro 3 nacional
([PDF](https://www.inec.gob.pa/archivos/P053342420231213140530Cuadro%2003.pdf)); una prueba lo
comprueba. Los `id` (`corr-<distrito>-<corregimiento>`) son internos, no códigos oficiales.
`app.seed` los inserta en `communities` con la población de 2023, sin vulnerabilidad ni
coordenadas, así que el formulario web, la priorización y el planificador comparten el mismo
catálogo. Sin coordenadas, el planificador los reporta como `SIN_UBICACION`.
Si el INEC publica cambios de división, hay que actualizar el archivo y su fecha.

## Qué se guarda

- `inbound_messages`: canal, ID externo (único por canal, lo que da idempotencia persistente),
  conversación, texto original, tipo, adjuntos (`file_id`, MIME, ruta relativa, bytes, sha256 o
  error), fecha y estado. Antes del consentimiento solo se guarda lo técnico (estado
  `PRE_CONSENT`, sin texto) y no se descargan archivos.
- `inbound_drafts`: un borrador por conversación. `fields` guarda el paso y las respuestas. Estados:
  `COLLECTING`, `CONFIRMED` (en entrega), `SUBMITTED` (con `report_id`), `PENDING` (con `missing`)
  o `CANCELLED`. El ID del borrador es el Idempotency-Key del reporte, así que un reintento nunca
  duplica.

Adjuntos admitidos: imagen JPEG/PNG/WebP; audio y nota de voz OGG/MP3/M4A/AAC/AMR; documento
PDF/JPEG/PNG/TXT. Tamaño máximo `MEDIA_MAX_BYTES` (10 MiB por defecto; la Bot API de Telegram
limita a 20 MiB). Se guardan en `MEDIA_PATH` con un nombre derivado de un hash y la API no los
sirve. Si la descarga falla, el mensaje se guarda igual con el error y el `file_id`.

## Variables de entorno (`.env` en la raíz)

| Variable | Uso |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token de @BotFather. Lo usa solo el receptor de polling. |
| `WHATSAPP_VERIFY_TOKEN` | Texto que eliges y repites en Meta para verificar el webhook. |
| `WHATSAPP_APP_SECRET` | App Secret de Meta; valida `X-Hub-Signature-256`. Sin él, el POST responde 503. |
| `WHATSAPP_ACCESS_TOKEN` | Token de Cloud API para descargar media y enviar respuestas. |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID (WhatsApp > API Setup) desde el que se responde. |
| `WHATSAPP_GRAPH_VERSION` | Versión de Graph API; por defecto `v23.0`. |
| `MEDIA_PATH` / `MEDIA_MAX_BYTES` | Carpeta privada de adjuntos (`../data/runtime/media`, ignorada por git) y tamaño máximo. |

## Telegram en local (long polling)

1. Crea el bot con @BotFather y pon el token en `TELEGRAM_BOT_TOKEN` dentro de `.env`.
2. Prepara la base de datos (una vez, y de nuevo tras actualizar la rama) desde `backend/`:

   ```powershell
   uv sync --locked
   uv run alembic upgrade head
   uv run python -m app.seed
   ```

3. Arranca cada proceso en su propia terminal, desde `backend/`:

   ```powershell
   uv run uvicorn app.api:app --port 8000
   uv run python -m app.worker
   uv run python -m app.integrations.telegram
   ```

4. Abre el chat del bot, pulsa Iniciar y sigue los botones. Al confirmar, el bot responde
   «Reporte registrado. Código de seguimiento: <id>».

Sin token, el receptor termina con «Configura TELEGRAM_BOT_TOKEN en .env».

Solo se procesan chats privados. El offset avanza cuando el mensaje ya está guardado: si el
receptor se cae, Telegram reenvía los mensajes y los duplicados se descartan sin volver a responder.
Si el receptor termina con `409`, el bot tiene un webhook o hay otro receptor activo; polling y
webhook no pueden convivir. Para usar polling, borra tú mismo ese webhook con `deleteWebhook`.

## WhatsApp Business Cloud API

Sin credenciales de Meta puedes probar con eventos que firmas tú. Pon cualquier valor en
`WHATSAPP_APP_SECRET` dentro de `.env` (el script lo lee de la misma configuración) y arranca la
API en el puerto 8000. Luego, en PowerShell, desde `backend/`:

```powershell
$wa = @'
import hashlib, hmac, json, sys, httpx
from app.config import Settings
n, text = sys.argv[1], sys.argv[2]
message = {"from": "50700000000", "id": f"wamid.LOCAL{n}", "timestamp": "1760000000", "type": "text", "text": {"body": text}}
body = json.dumps({"object": "whatsapp_business_account", "entry": [{"id": "1", "changes": [{"field": "messages", "value": {"messages": [message]}}]}]}).encode()
secret = Settings().whatsapp_app_secret.get_secret_value().encode()
signature = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
response = httpx.post("http://127.0.0.1:8000/api/integrations/whatsapp/webhook", content=body, headers={"X-Hub-Signature-256": signature})
print(response.status_code, response.text)
'@
$wa | uv run python - 1 "Hola"
$wa | uv run python - 2 "1"
$wa | uv run python - 3 "1"
$wa | uv run python - 4 "9"
$wa | uv run python - 5 "Omitir"
$wa | uv run python - 6 "1"
$wa | uv run python - 7 "Llevamos desde ayer sin agua"
$wa | uv run python - 8 "2 días"
$wa | uv run python - 9 "Omitir"
$wa | uv run python - 10 "Confirmar"
```

Los mensajes recorren: consentimiento (1 = Acepto) → Arraiján (1) → Vacamonte (9) → sin barriada →
No hay agua (1) → descripción → 2 días → sin archivos → Confirmar. Cada mensaje responde
`200 {"status":"received"}`. Usa un número nuevo en cada mensaje: repetir uno se trata como
reintento de Meta. Sin `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` el bot no puede
contestar (el log de la API muestra `whatsapp_send_error: SendNotConfigured`), pero cada paso se
guarda; compruébalo con la consulta de la sección «Verificar que los mensajes entraron».

Cuando tengas credenciales:

1. En developers.facebook.com crea la app con el producto WhatsApp. Copia el App Secret
   (Configuración > Básica), un token de acceso (temporal para pruebas o de usuario del sistema)
   y el Phone number ID (WhatsApp > API Setup).
2. Expón el backend por HTTPS (por ejemplo, un túnel de cloudflared o ngrok al puerto 8000).
3. En WhatsApp > Configuración: Callback URL `https://<tu-host>/api/integrations/whatsapp/webhook`
   y Verify token igual a `WHATSAPP_VERIFY_TOKEN`. Verifica y suscribe el campo `messages`.
4. Escribe desde un número autorizado como destinatario de prueba. El bot responde dentro de la
   ventana de 24 h que abre el mensaje del ciudadano, así que no necesita plantillas.

El POST responde 200 solo después de guardar cada mensaje. Firma inválida: 403. JSON inválido:
400. Error interno: 5xx, Meta reintenta y la idempotencia descarta lo ya guardado. Un fallo al
enviar la respuesta se registra y no provoca reintentos; el siguiente mensaje del ciudadano repite
la pregunta pendiente. **Ni Meta ni Telegram se han probado con credenciales reales**: las pruebas
usan eventos con el formato documentado y respuestas HTTP simuladas.

## Verificar que los mensajes entraron

```powershell
$inbound = Invoke-RestMethod http://127.0.0.1:8000/api/admin/inbound -Headers @{"X-Coordinator-Token"="<COORDINATOR_TOKEN>"}
$inbound | ForEach-Object { $_.draft } | Select-Object status, report_id, missing -Unique
Invoke-RestMethod http://127.0.0.1:8000/api/executions/<report_id>
```

Cada mensaje trae su `draft` con `status` y `fields` (paso y respuestas). Con `SUBMITTED`, el
`report_id` es el código que recibió el ciudadano y también el `thread_id`:
`/api/executions/<report_id>` muestra `QUEUED` y, cuando corre el worker, `WAITING_APPROVAL`; a
partir de ahí el reporte aparece en el Centro de Coordinación. Con `PENDING`, `missing` dice qué
falta. Los archivos están en `data/runtime/media/<canal>/`.

## Pruebas automáticas

Desde `backend/`, sin credenciales (eventos con formato oficial y HTTP simulado):

```powershell
uv run pytest -q -p no:cacheprovider tests/test_integrations.py
uv run pytest -q -p no:cacheprovider tests/test_migrations.py
uv run ruff check app tests migrations
```

`test_integrations.py` cubre la conversación completa por WhatsApp y Telegram, las correcciones,
el código de seguimiento, el fallo y el reintento del envío, el catálogo, la firma inválida, los
duplicados y las descargas fallidas. `test_migrations.py` aplica todas las migraciones, ejecuta
`alembic check`, baja a `base` y vuelve a subir.

## Política mínima para mensajes reales

Son reglas de operación del equipo para la demo, no una política oficial de ninguna institución.

- El bot pide consentimiento al inicio de cada reporte. Hasta que el ciudadano acepta solo se
  conserva lo técnico (ID del mensaje, conversación y paso), sin texto ni archivos. Si no acepta,
  no se guarda nada más.
- El uso es exclusivo para registrar y gestionar reportes del servicio de agua. No se piden nombre
  ni cédula, y el bot no envía mensajes fuera de la conversación iniciada por el ciudadano.
- Solo se procesan chats privados de Telegram; los grupos se ignoran.
- La base de datos y los adjuntos viven solo en local (`data/runtime/`, fuera de git). La API no
  sirve adjuntos, y `/api/admin/inbound`, que incluye número o chat, exige token de coordinación.
- Los logs registran canal, tipo y estado; nunca texto, número, chat ni IDs externos.
- Borrado y retención son manuales por ahora (falta el comando). Antes de usar datos reales, el
  equipo debe fijar el plazo y un contacto. Nunca copies mensajes reales a fixtures, tests ni bitácoras.
