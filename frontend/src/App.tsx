import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon, LockKeyIcon, SignOutIcon, WarningIcon } from '@phosphor-icons/react'
import { api } from './api'
import { ErrorMessage, Pill } from './components'
import { CitizenPage } from './pages/CitizenPage'
import { CoordinationPage } from './pages/CoordinationPage'

type Health = { is_simulated: boolean; provider?: string }

function loginError(error: Error & { status?: number }) {
  if (error.status === 401) return 'El token no es correcto. Revisa que esté completo y sin espacios.'
  if (error.status === 503) return 'El servidor no tiene configurado el token de coordinación (COORDINATOR_TOKEN). Pide a quien administra el servicio que lo configure.'
  return `No pudimos comprobar el acceso: ${error.message}`
}

function Login({ onEnter, notice }: { onEnter: (token: string) => void; notice: string | null }) {
  const [draft, setDraft] = useState('')
  const [visible, setVisible] = useState(false)
  // Probe a protected endpoint first, so a wrong token is reported here and not as an empty console.
  const verify = useMutation({
    mutationFn: (token: string) => api('/admin/executions?offset=0&limit=1', {}, token),
    onSuccess: (_, token) => { setDraft(''); onEnter(token) },
  })
  return (
    <section className="login panel raised stack" aria-labelledby="login-title">
      <span className="login-icon" aria-hidden="true"><LockKeyIcon /></span>
      <div className="stack-sm">
        <h1 id="login-title" style={{ fontSize: '1.6rem' }}>Acceso de coordinación</h1>
        <p className="muted">
          Para el equipo que revisa reportes y aprueba planes de cisternas en Panamá Oeste.
          El token se guarda solo en la memoria de esta pestaña y se borra al salir o al cerrarla.
        </p>
      </div>
      {notice && <p className="note warn" role="status"><WarningIcon aria-hidden="true" />{notice}</p>}
      <form className="stack" onSubmit={e => { e.preventDefault(); verify.mutate(draft.trim()) }}>
        <div className="field">
          <label htmlFor="coordinator-token">Token de coordinación</label>
          <span className="password">
            <input
              id="coordinator-token"
              required
              type={visible ? 'text' : 'password'}
              autoComplete="off"
              minLength={16}
              value={draft}
              aria-describedby="token-hint"
              onChange={e => { setDraft(e.target.value); verify.reset() }}
            />
            <button type="button" className="ghost" onClick={() => setVisible(!visible)}
              aria-label={visible ? 'Ocultar token' : 'Mostrar token'} aria-pressed={visible}>
              {visible ? <EyeSlashIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
            </button>
          </span>
          <span id="token-hint" className="hint">Mínimo 16 caracteres. En una prueba local es el valor de COORDINATOR_TOKEN en el archivo .env.</span>
        </div>
        {verify.error && <p role="alert" className="error">{loginError(verify.error)}</p>}
        <button type="submit" disabled={verify.isPending}>
          {verify.isPending ? 'Comprobando…' : 'Entrar'}
        </button>
      </form>
    </section>
  )
}

export default function App() {
  const [page, setPage] = useState<'citizen' | 'coordination'>('citizen')
  const [token, setToken] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const client = useQueryClient()
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<Health>('/health') })

  const leave = (message: string | null) => {
    setToken('')
    setNotice(message)
    client.removeQueries({ queryKey: ['admin'] })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#" onClick={e => { e.preventDefault(); setPage('citizen') }} aria-label="HidroAgente, ir al reporte ciudadano">
            <img className="brand-mark" src="/logo.png" alt="" width="38" height="38" />
            <span>HidroAgente<small>Panamá Oeste</small></span>
          </a>
          <div className="topbar-end">
            {page === 'citizen' ? (
              <button type="button" className="ghost" onClick={() => setPage('coordination')}>
                Acceso para coordinadores
              </button>
            ) : (
              <>
                {token && health.data && (
                  <span className="mode">
                    {health.data.is_simulated
                      ? <Pill tone="warn">Análisis simulado</Pill>
                      : <Pill tone="progress">Análisis con IA{health.data.provider ? ` (${health.data.provider})` : ''}</Pill>}
                  </span>
                )}
                <button type="button" className="ghost" onClick={() => setPage('citizen')}>
                  <ArrowLeftIcon aria-hidden="true" /> Vista ciudadana
                </button>
                {token && (
                  <button type="button" className="secondary small" onClick={() => leave(null)}>
                    <SignOutIcon aria-hidden="true" /> Salir
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {page === 'citizen' && health.data?.is_simulated && (
        <div className="notice-strip">
          <div><WarningIcon aria-hidden="true" /><span><strong>Versión de demostración:</strong> los ejemplos de esta página son casos ficticios.</span></div>
        </div>
      )}

      <main className="page" id="contenido">
        <ErrorMessage error={health.error} />
        {page === 'citizen' ? (
          <CitizenPage />
        ) : token ? (
          <CoordinationPage key={token} token={token}
            onUnauthorized={() => leave('La sesión dejó de ser válida: el token cambió en el servidor. Vuelve a introducirlo.')} />
        ) : (
          <Login notice={notice} onEnter={value => { client.removeQueries({ queryKey: ['admin'] }); setNotice(null); setToken(value) }} />
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span><strong>HidroAgente</strong>. Hackathon FISC AI Agents 2026, reto 1: crisis del agua en Panamá Oeste.</span>
          <span>La IA propone; una persona del equipo de coordinación decide.</span>
        </div>
      </footer>
    </div>
  )
}
