# Guardrails y límites de seguridad

| Amenaza | Control implementado | Evidencia |
|---|---|---|
| Abuso/entradas absurdas | Texto 8–2000, cuerpo ≤8 KiB, horas 0–2160, tipos/extra forbid, comunidad catalogada | Tests API + E03/E10 |
| Fuera de alcance e inyección conocida | Tema agua y patrones de instrucciones/control; contenido LLM se separa de instrucciones | E11/E12, contracts.py |
| Inyección novedosa que evade patrones | LLM sin herramientas, salidas Pydantic, candidatos permitidos, horas fundamentadas, DB en servicios | E20/E21 |
| UUID de incidente inventado o sector ajeno | Validar contra candidatos filtrados y tipo compatible | E20/E22 |
| Valores ausentes o contradictorios | null, flags, intervalo de prioridad y revisión humana | E02/E09, tests domain |
| Spam que aumenta urgencia | Población proviene del catálogo, jamás cantidad de reportes; 30 reportes/IP/minuto | E05/E06, rate limit test |
| Acción administrativa pública | Token mínimo 16 caracteres, compare_digest; listado/detalles/resume/retry protegidos | E16, security test |
| Revisión duplicada o dos coordinadores | CAS de estado, Review único, payload inmutable, aplicación idempotente | E17, competing_reviews |
| Caída de proceso/replay | Cola transaccional, checkpoint independiente, OS lock, efectos idempotentes | resilience + process_e2e |
| Error NIM o salida inválida | Timeout/reintentos acotados, error seguro, sin fallback a mock | E13 + provider tests |
| XSS por texto | React renderiza texto; no usa dangerouslySetInnerHTML | Revisión de componentes |
| Fuga de credenciales | .env ignorado, clave solo backend, token solo memoria, logs sin mensajes de proveedor | provider tests + frontend storage test |

El filtro de prompt injection es una primera barrera, no una prueba de detección universal.
La protección principal es que el LLM no recibe herramientas de ejecución/SQL y no puede autorizar
decisiones. La normalización semántica aún puede equivocarse; una persona revisa su resultado.
La ubicación elegida en el selector es la única usada; el texto no puede crear sectores.

Límites conscientes: token compartido no identifica personas, rate limit por IP puede afectar una
red compartida, no hay CAPTCHA ni protección DDoS, ni retención automática/anonimización de texto.
La API local no se publica directamente: antes de hacerlo requiere HTTPS, token fuerte, control de
acceso/roles, revisión de privacidad, límites de infraestructura y pruebas de carga. El ejemplo de
token es público y sirve exclusivamente en localhost. No confiar en X-Forwarded-For de terceros.

No se envía un reporte real con información personal a NVIDIA durante pruebas/CI. En modo NIM,
texto del reporte y candidatos sí se envían al endpoint configurado: obtener autorización y definir
política de datos antes de usar reportes reales. No se almacena razonamiento privado del modelo.
