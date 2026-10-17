import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CaretRightIcon, CheckIcon, CopyIcon, InfoIcon, TruckIcon, WarningIcon } from '@phosphor-icons/react'
import { api, polling, publicStatusPolling } from '../api'
import { ErrorMessage, ProcessStepper, StatusBadge } from '../components'
import { durationLabels } from '../labels'
import type { Community, DurationBucket, PublicReportStatus, Receipt, ReportInput, Status } from '../types'

const durationOptions = [
  ...Object.entries(durationLabels).map(([value, label]) => ({ value: value as DurationBucket, label })),
  { value: '', label: 'No lo sé' },
]

const demoExamples = [
  { community: 'crit-hosp-nicolas-solano', duration: 'H24_48', label: 'Hospital Nicolás A. Solano',
    description: 'Emergencia por falta de agua potable en el Hospital Nicolás A. Solano; los tanques de reserva soterrados están por agotarse.' },
  { community: 'ref-loma-burunga', duration: 'GE_48H', label: 'Loma de Burunga (parte alta)',
    description: 'Llevamos más de 48 horas sin agua en la Loma de Burunga, la presión no sube a las partes altas.' },
  { community: 'crit-esc-guillermo-andreve', duration: 'H24_48', label: 'Escuela Guillermo Andreve',
    description: 'Falta de agua en la Escuela Guillermo Andreve afectando el comedor y los servicios higiénicos.' },
  { community: 'crit-cs-nuevo-chorrillo', duration: 'H24_48', label: 'Centro de Salud Nuevo Chorrillo',
    description: 'El centro de salud de Nuevo Chorrillo está sin suministro de agua potable desde hace 24 horas.' },
  { community: 'ref-rey-vista-alegre', duration: 'H24_48', label: 'Corte en Vista Alegre',
    description: 'Llevamos más de 24 horas sin agua potable en Vista Alegre, no sale ni una gota de las plumas.' },
  { community: 'ref-parque-feuillet', duration: 'LT_12H', label: 'Fuga en Parque Feuillet',
    description: 'Fuga grande de agua potable por rotura de tubería principal en la calle central cerca del parque.' },
]

const statusMessages: Record<Status, string> = {
  QUEUED: 'Recibimos tu reporte. En unos segundos empezaremos a revisarlo.',
  RUNNING: 'Estamos revisando tu reporte y comparándolo con otros avisos de tu zona.',
  WAITING_APPROVAL: 'Una persona del equipo de coordinación está revisando tu reporte para decidir qué tan urgente es. No necesitas hacer nada más.',
  RESUME_QUEUED: 'El equipo de coordinación ya tomó una decisión. La estamos registrando.',
  APPROVED: 'El equipo aprobó la prioridad de tu reporte. Esto todavía no significa que un camión cisterna vaya en camino.',
  REJECTED: 'El equipo de coordinación revisó tu reporte y no aprobó la prioridad propuesta.',
  NEEDS_INFORMATION: 'Nos falta un dato. Cuéntanos si no sale agua, si sale muy poca o si hay una fuga.',
  ERROR: 'Tu reporte quedó guardado, pero hubo un problema al revisarlo. El equipo puede volver a intentarlo; no necesitas enviarlo otra vez.',
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
  const [district, setDistrict] = useState('')
  const [community, setCommunity] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('')
  const [requestId, setRequestId] = useState(() => getUUID())
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [lookupCode, setLookupCode] = useState('')
  const [searchedId, setSearchedId] = useState<string | null>(null)
  const [submittedBody, setSubmittedBody] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const communities = useQuery({ queryKey: ['communities'], queryFn: () => api<Community[]>('/communities') })
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ is_simulated: boolean }>('/health') })

  const submission = useMutation({
    mutationFn: (body: string) => api<Receipt>('/reports', {
      method: 'POST', headers: { 'Idempotency-Key': requestId }, body,
    }),
    onSuccess: r => {
      setReceipt(r)
      setSearchedId(r.report_id)
    },
  })

  const execution = useQuery({
    queryKey: ['status', receipt?.thread_id], enabled: !!receipt,
    queryFn: () => api<Receipt>(`/executions/${receipt!.thread_id}`),
    refetchInterval: query => polling(query.state.data?.status),
  })

  const activeReportId = receipt?.report_id || searchedId

  const publicStatus = useQuery({
    queryKey: ['publicStatus', activeReportId],
    enabled: !!activeReportId,
    queryFn: () => api<PublicReportStatus>(`/reports/${activeReportId}/public-status`),
    refetchInterval: query => publicStatusPolling(query.state.data),
  })

  const current = receipt
    ? (execution.data || receipt)
    : publicStatus.data
    ? { report_id: publicStatus.data.report_id, thread_id: '', status: publicStatus.data.status, is_simulated: false }
    : null

  const receiptHeading = useRef<HTMLHeadingElement>(null)

  // En móvil el botón de envío queda lejos del recibo: lo mostramos y anunciamos.
  useEffect(() => {
    if (!receipt && !searchedId) return
    receiptHeading.current?.focus()
    receiptHeading.current?.scrollIntoView?.({ block: 'center' })
  }, [receipt, searchedId])

  // Districts come from the catalog itself, so a new district appears without code changes.
  const byDistrict = useMemo(() => {
    const groups = new Map<string, Community[]>()
    for (const c of communities.data ?? []) groups.set(c.district, [...(groups.get(c.district) ?? []), c])
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
  }, [communities.data])
  const selected = communities.data?.find(c => c.id === community)
  const locked = !!submittedBody

  const startNewReport = (keepText: boolean) => {
    setReceipt(null)
    setSearchedId(null)
    setLookupCode('')
    setRequestId(getUUID())
    setSubmittedBody(null)
    setCopyState('idle')
    if (!keepText) {
      setDescription('')
      setDuration('')
    }
    submission.reset()
  }

  const handleQuickFill = (example: typeof demoExamples[number]) => {
    const match = communities.data?.find(c => c.id === example.community) ?? communities.data?.[0]
    if (match) {
      setDistrict(match.district)
      setCommunity(match.id)
    }
    setDescription(example.description)
    setDuration(example.duration)
  }

  const copyReportId = async (reportId: string) => {
    try {
      await navigator.clipboard.writeText(reportId)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const durationLabel = durationOptions.find(o => o.value === duration)?.label
  const descriptionReady = description.trim().length >= 8

  return (
    <div className="citizen">
      <section className="panel raised" aria-labelledby="citizen-title">
        {current ? (
          <div aria-live="polite" className="receipt">
            <div className="receipt-head">
              <span className="receipt-icon" aria-hidden="true"><CheckIcon weight="bold" /></span>
              <div className="stack-sm">
                <h1 id="citizen-title" ref={receiptHeading} tabIndex={-1}>
                  {receipt ? 'Recibimos tu reporte' : 'Estado de tu reporte'}
                </h1>
                <div><StatusBadge status={current.status} audience="citizen" /></div>
              </div>
            </div>

            <p className="status-text">{statusMessages[current.status]}</p>
            <ProcessStepper status={current.status} />

            {publicStatus.data?.notice && (
              <div className={`arrival ${publicStatus.data.notice.kind === 'SCHEDULED' ? 'scheduled' : 'unserved'}`}>
                <strong className="row" style={{ gap: 8 }}>
                  {publicStatus.data.notice.kind === 'SCHEDULED'
                    ? <><TruckIcon aria-hidden="true" /> Camión cisterna programado</>
                    : <><InfoIcon aria-hidden="true" /> Información de tu reporte</>}
                </strong>
                {publicStatus.data.notice.arrival && (
                  <div>
                    <span className="muted small">Hora estimada de llegada</span>
                    <div className="arrival-time">{publicStatus.data.notice.arrival}</div>
                  </div>
                )}
                <p>{publicStatus.data.notice.text}</p>
                {publicStatus.data.notice.kind === 'SCHEDULED' && (
                  <small className="muted">La hora estimada corresponde al día de hoy según la programación aprobada por coordinación.</small>
                )}
              </div>
            )}

            <div className="code-box">
              <span className="small muted">Código de seguimiento</span>
              <code>{current.report_id}</code>
              <div className="row">
                <button type="button" className="secondary small" onClick={() => copyReportId(current.report_id)}>
                  <CopyIcon aria-hidden="true" /> Copiar código
                </button>
                <span role="status" className="small muted">
                  {copyState === 'copied' && 'Código copiado.'}
                  {copyState === 'failed' && 'No se pudo copiar. Mantén presionado el código para copiarlo.'}
                </span>
              </div>
              <small className="muted">Guárdalo: con este código puedes consultar el estado de tu reporte desde esta página.</small>
            </div>

            <ErrorMessage error={execution.error} />

            <div className="row">
              {current.status === 'NEEDS_INFORMATION' ? (
                <button type="button" onClick={() => startNewReport(true)}>Completar mi reporte</button>
              ) : (
                <button type="button" className="secondary" onClick={() => startNewReport(false)}>Hacer otro reporte</button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="citizen-intro">
              <h1 id="citizen-title">¿Tienes problemas con el agua?</h1>
              <p>Avísanos en un minuto. No pedimos tu nombre ni tu teléfono.</p>
            </div>

            <form
              className="report-form"
              onSubmit={event => {
                event.preventDefault()
                const body = submittedBody || JSON.stringify({
                  community_id: community,
                  description: description.trim(),
                  duration_bucket: duration === '' ? null : duration as DurationBucket,
                } satisfies ReportInput)
                setSubmittedBody(body)
                submission.mutate(body)
              }}
            >
              <div className={`step ${selected ? 'is-complete' : ''}`}>
                <span className="step-num" aria-hidden="true">{selected ? <CheckIcon weight="bold" /> : 1}</span>
                <div className="step-body">
                  <span className="step-title">¿Dónde ocurre?</span>
                  {communities.isPending && <p role="status" className="muted">Cargando comunidades…</p>}
                  <ErrorMessage error={communities.error} />
                  {byDistrict.length > 1 && (
                    <fieldset disabled={locked}>
                      <legend>Distrito</legend>
                      <div className="chips">
                        {[['', 'Todos'] as const, ...byDistrict.map(([name]) => [name, name] as const)].map(([value, text]) => (
                          <label key={value || 'all'} className="choice">
                            <input type="radio" name="district" value={value} checked={district === value}
                              onChange={() => {
                                setDistrict(value)
                                if (value && selected && selected.district !== value) setCommunity('')
                              }} />
                            {text}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <div className="field">
                    <label htmlFor="community">Comunidad o corregimiento</label>
                    <select id="community" required value={community} disabled={locked} aria-describedby="community-help"
                      onChange={e => setCommunity(e.target.value)}>
                      <option value="">Elige tu comunidad</option>
                      {byDistrict
                        .filter(([name]) => !district || name === district)
                        .map(([name, list]) => (
                          <optgroup key={name} label={`Distrito de ${name}`}>
                            {list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </optgroup>
                        ))}
                    </select>
                    <span id="community-help" className="hint">Si no ves tu barriada, elige el corregimiento o la comunidad más cercana.</span>
                  </div>
                </div>
              </div>

              <div className={`step ${descriptionReady ? 'is-complete' : ''}`}>
                <span className="step-num" aria-hidden="true">{descriptionReady ? <CheckIcon weight="bold" /> : 2}</span>
                <div className="step-body">
                  <div className="field">
                    <label htmlFor="description" className="step-title">¿Qué está pasando?</label>
                    <textarea id="description" required minLength={8} maxLength={2000} rows={4} value={description} disabled={locked}
                      aria-describedby="description-help" onChange={e => setDescription(e.target.value)}
                      placeholder="Ejemplo: No sale agua desde ayer en la mañana. En la casa vive una persona mayor." />
                    <span id="description-help" className="hint">
                      Cuéntanos con tus palabras si no sale agua, sale poca o hay una fuga. No escribas nombres, teléfonos ni direcciones.
                    </span>
                  </div>
                  <span className="count" aria-live="polite">
                    {description.length > 1800 ? `Te quedan ${2000 - description.length} caracteres.` : `${description.length} / 2000`}
                  </span>
                </div>
              </div>

              <div className="step is-complete">
                <span className="step-num" aria-hidden="true">3</span>
                <div className="step-body">
                  <fieldset className="stack-sm" disabled={locked}>
                    <legend className="step-title">¿Cuánto tiempo llevas sin agua?</legend>
                    <div className="choices cols">
                      {durationOptions.map(option => (
                        <label key={option.label} className="choice">
                          <input type="radio" name="duration" value={option.value} checked={duration === option.value}
                            onChange={() => setDuration(option.value)} />
                          {option.label}
                        </label>
                      ))}
                    </div>
                    <p className="hint">Medio día son 12 horas. Si ya cumpliste 1 día (24 h) o 2 días (48 h), elige el intervalo que empieza ahí.</p>
                  </fieldset>
                </div>
              </div>

              <div className="step">
                <span className="step-num" aria-hidden="true">4</span>
                <div className="step-body">
                  <span className="step-title">Revisa y envía</span>
                  <div className="review">
                    <dl>
                      <div>
                        <dt>Lugar</dt>
                        <dd className={selected ? '' : 'missing'}>{selected ? `${selected.name}, ${selected.district}` : 'Falta elegir la comunidad'}</dd>
                      </div>
                      <div>
                        <dt>Problema</dt>
                        <dd className={descriptionReady ? '' : 'missing'}>
                          {descriptionReady
                            ? (description.trim().length > 140 ? `${description.trim().slice(0, 139)}…` : description.trim())
                            : 'Falta describirlo (mínimo 8 caracteres)'}
                        </dd>
                      </div>
                      <div><dt>Tiempo sin agua</dt><dd>{durationLabel}</dd></div>
                    </dl>
                  </div>
                  <ErrorMessage error={submission.error} />
                  <div className="submit-row">
                    <button type="submit" disabled={submission.isPending || !communities.data?.length}>
                      {submission.isPending ? 'Enviando…' : submittedBody ? 'Intentar de nuevo' : 'Enviar reporte'}
                    </button>
                    {submission.isError && (
                      <>
                        <p className="hint">Si lo intentas de nuevo no se creará un reporte repetido.</p>
                        <button type="button" className="secondary" style={{ justifySelf: 'start' }}
                          onClick={() => { setSubmittedBody(null); setRequestId(getUUID()); submission.reset() }}>
                          Cambiar mi reporte
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </>
        )}
      </section>

      <aside className="aside" aria-label="Información sobre los reportes">
        <section className="panel stack" aria-labelledby="lookup-title">
          <h2 id="lookup-title" style={{ fontSize: '1.1rem' }}>¿Ya hiciste un reporte?</h2>
          <form className="lookup-form" onSubmit={e => {
            e.preventDefault()
            if (lookupCode.trim()) setSearchedId(lookupCode.trim())
          }}>
            <label className="sr-only" htmlFor="lookup-code">Código de seguimiento</label>
            <input id="lookup-code" type="text" required value={lookupCode} onChange={e => setLookupCode(e.target.value)}
              placeholder="Pega aquí tu código de seguimiento" aria-describedby="lookup-help" />
            <button type="submit" className="secondary">Consultar</button>
          </form>
          <p id="lookup-help" className="hint">Es el código que te mostramos al enviar el reporte, o el que te dio el chat de WhatsApp o Telegram.</p>
          {publicStatus.isError && searchedId && (
            <p className="note warn" role="alert">
              <WarningIcon aria-hidden="true" />
              No encontramos ningún reporte con ese código. Revisa que esté bien escrito o crea un reporte nuevo.
            </p>
          )}
        </section>

        <section className="panel stack" aria-labelledby="how-title">
          <h2 id="how-title" style={{ fontSize: '1.1rem' }}>¿Qué pasa con tu reporte?</h2>
          <ol className="how">
            <li>Nos cuentas qué pasa con el agua en tu comunidad.</li>
            <li>Lo revisamos y lo juntamos con otros avisos de tu zona.</li>
            <li>Calculamos qué tan urgente es, de forma igual para todos.</li>
            <li>Una persona del equipo de coordinación decide la prioridad.</li>
          </ol>
          <p className="hint">
            Esta página no pide datos personales. Reportar no garantiza que llegue un camión cisterna,
            pero ayuda a decidir a qué comunidades atender primero.
          </p>
        </section>

        {health.data?.is_simulated && (
          <details className="panel disclosure">
            <summary><CaretRightIcon aria-hidden="true" /> Rellenar con un ejemplo ficticio</summary>
            <p className="hint">Solo para la demostración: completa el formulario con un caso inventado.</p>
            <div className="example-list">
              {demoExamples.map(example => (
                <button key={example.label} type="button" className="secondary small" disabled={locked || !!current}
                  onClick={() => handleQuickFill(example)}>
                  Ejemplo: {example.label}
                </button>
              ))}
            </div>
          </details>
        )}
      </aside>
    </div>
  )
}
