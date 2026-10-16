# Comprobación de inferencia real — 2026-10-16

Solicitud: activar inferencia real en la aplicación local. Se usó la clave NVIDIA ya configurada
en `.env`; no se imprimió, copió a documentación ni incluyó en comandos como valor literal.
Todos los textos enviados para esta comprobación son sintéticos.

## Resultados observados

| Prueba | Resultado |
|---|---|
| Catálogo NVIDIA | Respondió; listar un modelo no garantiza que su inferencia funcione |
| DeepSeek V4.1 Flash, JSON mode | Timeout con 10 s/reintentos y con 60 s sin reintentos |
| DeepSeek V4.1 Flash, sin JSON mode | Timeout a 30 s |
| Kimi K2.6 listado por el catálogo | NotFoundError / HTTP 404 al solicitar inferencia |
| GPT-OSS-20B, contrato completo con JSON mode | Timeout a 30 s |
| GPT-OSS-20B, mensaje mínimo sin JSON mode | Respuesta en 1.47 s |
| GPT-OSS-20B, mismo contrato de ingesta sin JSON mode | Respuesta validada en 3.62 s |

Se retiró `response_format={type: json_object}` del adaptador. La instrucción contiene el esquema
JSON completo y Pydantic sigue rechazando salidas inválidas. Las pruebas de contrato y error se
mantienen; suite offline tras el cambio: **53 passed en 16.79 s**, Ruff aprobado.
Estos resultados son observaciones locales, no una garantía de disponibilidad futura ni benchmark.

## Flujo real de la aplicación

- Proveedor persistido: `nvidia:openai/gpt-oss-20b`; `is_simulated=false`.
- Ejecución: `f27c37a6-0fcb-4b01-85e8-f5ef2a4d3b08`.
- POST devolvió 202 QUEUED; luego RUNNING y WAITING_APPROVAL con propuesta persistida y sin error.
- Trazas verificadas de ingestion, verification y coordination. Revisión humana dejada pendiente.
- API y proxy del frontend devuelven health con `provider=nvidia`, `is_simulated=false`.
- Configuración local: timeout 30 s, negocio `data/runtime/aguaia-nvidia.db`, checkpoints
  `data/runtime/checkpoints-nvidia.db`. Los archivos de la demo mock se conservaron sin borrar.

La UI debe mostrar MODO NVIDIA después de recargar. La puntuación permanece determinística por
arquitectura; los sectores y sus cifras siguen siendo sintéticos. No hay despacho real de agua.
No se ejecutaron las 22 evals contra el modelo real ni se verificó facturación. No se afirma que
DeepSeek/Kimi estén validados; GPT-OSS-20B se seleccionó explícitamente por configuración, sin fallback
automático. No se cambiaron dependencias, grafo, contratos públicos ni reglas de prioridad.
