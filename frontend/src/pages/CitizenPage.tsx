import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, polling } from '../api'
import { ErrorMessage, StatusBadge } from '../components'
import type { Community, Receipt } from '../types'

export function CitizenPage() {
  const [community, setCommunity] = useState('')
  const [description, setDescription] = useState('')
  const [hours, setHours] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [submittedBody, setSubmittedBody] = useState<string | null>(null)
  const communities = useQuery({ queryKey: ['communities'], queryFn: () => api<Community[]>('/communities') })
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
  return <div className="citizen-grid">
    <section className="intro">
      <p className="eyebrow">PANAMÁ OESTE · RETO AGUA</p>
      <h1>Cada comunidad<br />merece ser escuchada.</h1>
      <p>Reporta una interrupción de agua. AguaIA organiza los reportes y propone una prioridad
        explicable para la revisión de un coordinador.</p>
      <ol className="steps">
        <li><span>01</span> Cuéntanos qué ocurre</li>
        <li><span>02</span> Analizamos y consolidamos</li>
        <li><span>03</span> Una persona revisa la prioridad</li>
      </ol>
      <div className="note">Esta demostración no solicita datos personales ni despacha cisternas.
        Los sectores del catálogo son sintéticos.</div>
    </section>
    <section className="card" aria-label="Reporte ciudadano">
      <p className="eyebrow">REPORTE CIUDADANO</p><h2>¿Qué pasa con el agua?</h2>
      {current ? <div aria-live="polite" className="stack">
        <h3>Reporte recibido</h3><StatusBadge status={current.status} />
        <p className="muted">Guarda este identificador para consultar tu reporte:</p>
        <code className="break-all">{current.report_id}</code>
        {current.status === 'QUEUED' && <p>Guardado. Espera a que el procesador tome el reporte.</p>}
        {current.status === 'NEEDS_INFORMATION' && <p>Envía un nuevo reporte indicando si hay un corte,
          baja presión o una fuga de agua.</p>}
        {current.status === 'ERROR' && <p>El coordinador puede revisar el error y reintentar el análisis.</p>}
        {current.status === 'APPROVED' && <p>La prioridad fue registrada. Esto no confirma una entrega de agua.</p>}
        <ErrorMessage error={execution.error} />
        <button className="secondary" onClick={() => {
          setReceipt(null); setRequestId(crypto.randomUUID()); setSubmittedBody(null)
          setDescription(''); setHours(''); submission.reset()
        }}>Crear otro reporte</button>
      </div> : <form className="stack" onSubmit={event => {
        event.preventDefault()
        const body = submittedBody || JSON.stringify({ community_id: community,
          description: description.trim(), hours_without_water: hours === '' ? null : Number(hours) })
        setSubmittedBody(body)
        submission.mutate(body)
      }}>
        <label>Comunidad
          <select required value={community} disabled={!!submittedBody}
            onChange={e => setCommunity(e.target.value)}>
            <option value="">Selecciona un sector</option>
            {communities.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {communities.isPending && <p role="status">Cargando comunidades…</p>}
        <ErrorMessage error={communities.error} />
        <label>Descripción
          <textarea required minLength={8} maxLength={2000} rows={4} value={description}
            disabled={!!submittedBody} onChange={e => setDescription(e.target.value)}
            placeholder="Ejemplo: estamos sin agua desde hace 24 horas." />
        </label>
        <label>Horas sin agua <span className="muted">(opcional)</span>
          <input type="number" min="0" max="2160" step="0.5" value={hours}
            disabled={!!submittedBody} onChange={e => setHours(e.target.value)} />
        </label>
        <p className="muted text-sm">Si no conoces la duración, déjala vacía. Evita nombres,
          teléfonos y direcciones personales.</p>
        <ErrorMessage error={submission.error} />
        <button disabled={submission.isPending || !communities.data?.length}>
          {submission.isPending ? 'Guardando…' : submittedBody ? 'Reintentar el mismo reporte' : 'Enviar reporte'}
        </button>
        {submission.isError && <button type="button" className="secondary" onClick={() => {
          setSubmittedBody(null); setRequestId(crypto.randomUUID()); submission.reset()
        }}>Editar como un nuevo reporte</button>}
      </form>}
    </section>
  </div>
}
