# Bitácora de uso de IA

## 2026-10-16 — Fundación y vertical slice

- Herramienta: Codex en entorno local Windows; instrucciones del entorno lo identifican como
  agente basado en GPT-6. Variante exacta de modelo no verificada.
- Entrada: requerimiento del usuario y `docs/ARCHITECTURE.md` existente con D1–D7.
  La sesión anterior de grill-me no fue observada; se recibió su documento aprobado.
- Skills consultadas: Ponytail full y Ponytail Review desde la instalación local del plugin.
- Trabajo: backend/API/worker/LangGraph, proveedores Mock/NIM, dominio/persistencia, frontend,
  tests/evals, documentación, CI y plantillas. README evolucionado preservando equipo y secciones;
  marcador oficial actualizado de Reto: 0 a Reto: 1 según instrucción explícita.
- Herramientas: edición local, PowerShell, uv, npm, pytest, Ruff, mypy, Alembic, Vitest,
  TypeScript/Vite; consulta de documentación oficial de LangGraph y catálogo NVIDIA.
- Verificación: ver EVALUATION y REVIEW. Resultados provienen de comandos ejecutados.
- Revisión humana: pendiente. No se atribuyen modificaciones manuales a los integrantes.
- Acciones remotas/Git: no se hicieron commits, pushes, merges, cambios de rama, tags ni Issues.
- Simulación: interpretación mock y transporte HTTP simulado en pruebas NIM, sin llamadas pagadas.

## Activación real posterior — 2026-10-16

Por solicitud del usuario, se comprobó NVIDIA con credenciales ya presentes en `.env`, sin
mostrarlas. Se observaron timeouts en DeepSeek y 404 en Kimi K2.6. Una prueba controlada de
GPT-OSS-20B respondió al retirar `response_format`; se ajustaron `providers.py` y su prueba de
contrato, conservando la validación Pydantic. Las 53 pruebas offline pasaron nuevamente.
Se configuró GPT-OSS-20B en `.env`, con DB/checkpoints separados de la demo mock, y se reiniciaron
API y worker. Un reporte sintético completó los tres agentes con `is_simulated=false` y quedó
WAITING_APPROVAL. No se aprobó en nombre del usuario ni se atribuye una revisión humana completada.
Evidencia y límites: NVIDIA_SMOKE. No se verificó la facturación de las llamadas.

## Plantilla para nuevas entradas

Fecha / autor humano / herramienta y modelo conocido / objetivo / archivos / sugerencias aceptadas
y descartadas / cambios manuales verificables / comandos y resultados / revisión humana / límites
y tareas pendientes. Nunca pegar claves ni reportes personales en esta bitácora.
