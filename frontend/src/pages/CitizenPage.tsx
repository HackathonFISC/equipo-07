import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, polling } from '../api'
import { ErrorMessage, ProcessStepper, StatusBadge } from '../components'
import type { Community, Receipt, Status } from '../types'

// Cada opción cae dentro de un tramo de domain.py (<12, 12–24, 24–48, ≥48 h),
// así la prioridad es la misma que si la persona escribiera las horas exactas.
const durationOptions = [
  { value: '6', label: 'Menos de medio día' },
  { value: '18', label: 'Entre medio día y 1 día' },
  { value: '36', label: 'Entre 1 y 2 días' },
  { value: '48', label: '2 días o más' },
  { value: '', label: 'No lo sé' },
]

const demoExamples = [
  { community: 'arraijan-demo', hours: '36', label: 'Corte total en Arraiján',
    description: 'Llevamos más de 36 horas sin agua en toda la barriada. Las casas altas no tienen ni una gota.' },
  { community: 'chorrera-demo', hours: '18', label: 'Fuga en tubería en La Chorrera',
    description: 'Fuga grande de agua potable por rotura de tubería principal en la calle central.' },
  { community: 'arraijan-demo', hours: '36', label: 'Centro de salud sin agua',
    description: 'Falta de agua afectando el centro de salud y la escuela primaria comunitaria.' },
  { community: 'crit-hosp-nicolas-solano', hours: '18', label: 'Hospital Nicolás A. Solano',
    description: 'Emergencia por falta de agua potable en el Hospital Nicolás A. Solano; los tanques de reserva soterrados están por agotarse.' },
  { community: 'ref-loma-burunga', hours: '48', label: 'Loma de Burunga (parte alta)',
    description: 'Llevamos más de 48 horas sin agua en la Loma de Burunga, la presión no sube a las partes altas.' },
  { community: 'crit-esc-guillermo-andreve', hours: '36', label: 'Escuela Guillermo Andreve',
    description: 'Falta de agua en la Escuela Guillermo Andreve afectando el comedor y los servicios higiénicos.' },
]

const statusMessages: Record<Status, { tone: string; text: string }> = {
  QUEUED: { tone: 'info', text: 'Recibimos tu reporte. En unos segundos empezaremos a revisarlo.' },
  RUNNING: { tone: 'info', text: 'Estamos revisando tu reporte y comparándolo con otros avisos de tu zona.' },
  WAITING_APPROVAL: { tone: 'pending', text: 'Una persona del equipo de coordinación está revisando tu reporte para decidir qué tan urgente es. No necesitas hacer nada más.' },
  RESUME_QUEUED: { tone: 'info', text: 'El equipo de coordinación ya tomó una decisión. La estamos registrando.' },
  APPROVED: { tone: 'success', text: 'El equipo aprobó la prioridad de tu reporte. Esto todavía no significa que un camión cisterna vaya en camino.' },
  REJECTED: { tone: 'warning', text: 'El equipo de coordinación revisó tu reporte y no aprobó la prioridad propuesta.' },
  NEEDS_INFORMATION: { tone: 'warning', text: 'Nos falta un dato. Cuéntanos si no sale agua, si sale muy poca o si hay una fuga.' },
  ERROR: { tone: 'error', text: 'Tu reporte quedó guardado, pero hubo un problema al revisarlo. El equipo puede volver a intentarlo; no necesitas enviarlo otra vez.' },
}

function getUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function CitizenPage() {
  const [community, setCommunity] = useState('')
  const [description, setDescription] = useState('')
  const [hours, setHours] = useState('')
  const [requestId, setRequestId] = useState(() => getUUID())
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [submittedBody, setSubmittedBody] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const communities = useQuery({ queryKey: ['communities'], queryFn: () => api<Community[]>('/communities') })
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ is_simulated: boolean }>('/health') })

  const submission = useMutation({
    mutationFn: (body: string) => api<Receipt>('/reports', {
      method: 'POST', headers: { 'Idempotency-Key': requestId }, body,
    }),
    onSuccess: setReceipt,
  })

  const execution = useQuery({
    queryKey: ['status', receipt?.thread_id], enabled: !!receipt,
    queryFn: () => api<Receipt>(`/executions/${receipt!.thread_id}`),
    refetchInterval: query => polling(query.state.data?.status),
  })

  const current = execution.data || receipt
  const receiptHeading = useRef<HTMLHeadingElement>(null)

  // En móvil el botón de envío queda lejos del recibo: lo mostramos y anunciamos.
  useEffect(() => {
    if (!receipt) return
    receiptHeading.current?.focus()
    receiptHeading.current?.scrollIntoView?.({ block: 'center' })
  }, [receipt])

  const startNewReport = (keepText: boolean) => {
    setReceipt(null)
    setRequestId(getUUID())
    setSubmittedBody(null)
    setCopyState('idle')
    if (!keepText) {
      setDescription('')
      setHours('')
    }
    submission.reset()
  }

  const handleQuickFill = (example: typeof demoExamples[number]) => {
    if (communities.data?.some(c => c.id === example.community)) {
      setCommunity(example.community)
    } else if (communities.data?.[0]) {
      setCommunity(communities.data[0].id)
    }
    setDescription(example.description)
    setHours(example.hours)
  }

  const copyReportId = async (reportId: string) => {
    try {
      await navigator.clipboard.writeText(reportId)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  // Agrupar comunidades por distrito si están disponibles
  const arraijanCommunities = communities.data?.filter(c => c.district === 'Arraiján') || []
  const chorreraCommunities = communities.data?.filter(c => c.district === 'La Chorrera') || []
  const otherCommunities = communities.data?.filter(c => c.district !== 'Arraiján' && c.district !== 'La Chorrera') || []

  return (
    <div className="citizen-grid">
      <section className="card form-card" aria-labelledby="citizen-title">
        <div className="card-header">
          <h1 id="citizen-title">¿Tienes problemas con el agua?</h1>
          {!current && <p className="card-subtext">Avísanos en 1 minuto. No pedimos tu nombre ni tu teléfono.</p>}
        </div>

        {current ? (
          <div aria-live="polite" className="stack submission-success">
            <div className="receipt-banner">
              <h2 ref={receiptHeading} tabIndex={-1}>Recibimos tu reporte</h2>
              <StatusBadge status={current.status} audience="citizen" />
            </div>

            <p className={`status-msg ${statusMessages[current.status].tone}`}>
              {statusMessages[current.status].text}
            </p>

            <ProcessStepper status={current.status} />

            <div className="report-id-box">
              <span className="id-label">Código de tu reporte</span>
              <code className="break-all">{current.report_id}</code>
              <div className="copy-row">
                <button type="button" className="secondary" onClick={() => copyReportId(current.report_id)}>
                  Copiar código
                </button>
                <span role="status" className="muted">
                  {copyState === 'copied' && 'Código copiado.'}
                  {copyState === 'failed' && 'No se pudo copiar. Mantén presionado el código para copiarlo.'}
                </span>
              </div>
              <small className="muted">Guárdalo: identifica tu reporte si el equipo de coordinación lo necesita.</small>
            </div>

            <ErrorMessage error={execution.error} />

            {current.status === 'NEEDS_INFORMATION' ? (
              <button type="button" onClick={() => startNewReport(true)}>
                Completar mi reporte
              </button>
            ) : (
              <button type="button" className="secondary" onClick={() => startNewReport(false)}>
                Hacer otro reporte
              </button>
            )}
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={event => {
              event.preventDefault()
              const body = submittedBody || JSON.stringify({
                community_id: community,
                description: description.trim(),
                hours_without_water: hours === '' ? null : Number(hours),
              })
              setSubmittedBody(body)
              submission.mutate(body)
            }}
          >
            <label>
              Comunidad
              <select
                required
                value={community}
                disabled={!!submittedBody}
                aria-describedby="community-help"
                onChange={e => setCommunity(e.target.value)}
              >
                <option value="">Elige tu comunidad</option>
                {arraijanCommunities.length > 0 && (
                  <optgroup label="Distrito de Arraiján">
                    {arraijanCommunities.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                )}
                {chorreraCommunities.length > 0 && (
                  <optgroup label="Distrito de La Chorrera">
                    {chorreraCommunities.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                )}
                {otherCommunities.length > 0 && (
                  <optgroup label="Otros sectores">
                    {otherCommunities.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                )}
                {(!arraijanCommunities.length && !chorreraCommunities.length) &&
                  communities.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <p id="community-help" className="field-help">Si no ves tu barriada, elige la más cercana.</p>
            {communities.isPending && <p role="status">Cargando comunidades…</p>}
            <ErrorMessage error={communities.error} />

            <label>
              Descripción
              <textarea
                required
                minLength={8}
                maxLength={2000}
                rows={4}
                value={description}
                disabled={!!submittedBody}
                aria-describedby="description-help"
                onChange={e => setDescription(e.target.value)}
                placeholder="Ejemplo: No sale agua desde ayer en la mañana. En la casa vive una persona mayor."
              />
            </label>
            <p id="description-help" className="field-help">
              Cuéntanos con tus palabras qué pasa: si no sale agua, sale poca o hay una fuga.
              No escribas nombres, teléfonos ni direcciones.
              {description.length > 1800 && ` Te quedan ${2000 - description.length} caracteres.`}
            </p>

            <fieldset className="choice-group" disabled={!!submittedBody}>
              <legend>¿Cuánto tiempo llevas sin agua?</legend>
              {durationOptions.map(option => (
                <label key={option.label} className="choice">
                  <input
                    type="radio"
                    name="hours"
                    value={option.value}
                    checked={hours === option.value}
                    onChange={() => setHours(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <ErrorMessage error={submission.error} />

            <button className="submit-btn" disabled={submission.isPending || !communities.data?.length}>
              {submission.isPending ? 'Enviando…' : submittedBody ? 'Intentar de nuevo' : 'Enviar reporte'}
            </button>

            {submission.isError && (
              <>
                <p className="field-help">Si lo intentas de nuevo no se creará un reporte repetido.</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setSubmittedBody(null)
                    setRequestId(getUUID())
                    submission.reset()
                  }}
                >
                  Cambiar mi reporte
                </button>
              </>
            )}
          </form>
        )}
      </section>

      <aside className="intro" aria-labelledby="how-title">
        <h2 id="how-title">¿Qué pasa con tu reporte?</h2>
        <ol className="steps">
          <li><span aria-hidden="true">1</span> Nos cuentas qué pasa con el agua en tu comunidad.</li>
          <li><span aria-hidden="true">2</span> Lo revisamos y lo juntamos con otros avisos de tu zona.</li>
          <li><span aria-hidden="true">3</span> Calculamos qué tan urgente es, de forma igual para todos.</li>
          <li><span aria-hidden="true">4</span> Una persona del equipo de coordinación decide la prioridad.</li>
        </ol>

        <p className="note">
          Esta página no pide datos personales. Reportar no garantiza que llegue un camión cisterna,
          pero ayuda a decidir a qué comunidades atender primero.
        </p>

        {health.data?.is_simulated && (
          <div className="quick-examples">
            <h3 className="quick-title">Datos de ejemplo (solo para la demostración)</h3>
            <p className="field-help">Rellenan el formulario con un caso ficticio.</p>
            <div className="chips-row">
              {demoExamples.map(example => (
                <button
                  key={example.label}
                  type="button"
                  className="chip-btn"
                  disabled={!!submittedBody || !!current}
                  onClick={() => handleQuickFill(example)}
                >
                  Ejemplo: {example.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
