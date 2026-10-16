import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { ErrorMessage } from './components'
import { CitizenPage } from './pages/CitizenPage'
import { CoordinationPage } from './pages/CoordinationPage'

export default function App() {
  const [page, setPage] = useState<'citizen' | 'coordination'>('citizen')
  const [token, setToken] = useState('')
  const [draftToken, setDraftToken] = useState('')
  const client = useQueryClient()
  const health = useQuery({ queryKey: ['health'],
    queryFn: () => api<{ is_simulated: boolean }>('/health') })
  return <>
    <header><a className="brand" href="#" onClick={() => setPage('citizen')} aria-label="AguaIA inicio">
      <span className="brand-mark">A</span> Agua<span>IA</span></a>
      <nav aria-label="Navegación principal">
        <button className={page === 'citizen' ? 'nav active' : 'nav'} onClick={() => setPage('citizen')}>Reportar</button>
        <button className={page === 'coordination' ? 'nav active' : 'nav'} onClick={() => setPage('coordination')}>Coordinación</button>
      </nav>
    </header>
    <div className="demo-banner">{health.data ? health.data.is_simulated ?
      'DEMO OFFLINE · Interpretación simulada y determinística' : 'MODO NVIDIA · Interpretación mediante LLM' :
      'Conectando con el servicio…'} · Datos de sectores sintéticos</div>
    <main><ErrorMessage error={health.error} />
      {page === 'citizen' ? <CitizenPage /> : token ? <>
        <div className="session"><span>Sesión de coordinación</span><button className="secondary" onClick={() => {
          setToken(''); client.removeQueries({ queryKey: ['admin'] })
        }}>Salir</button></div>
        <CoordinationPage key={token} token={token} />
      </> : <section className="card login stack"><h1>Acceso de coordinación</h1>
        <p>Introduce el token configurado para esta demostración. Se conserva solo mientras esta página está abierta.</p>
        <form className="stack" onSubmit={e => {
          e.preventDefault(); client.removeQueries({ queryKey: ['admin'] }); setToken(draftToken); setDraftToken('')
        }}><label>Token de coordinación<input required type="password" autoComplete="off" minLength={16}
          value={draftToken} onChange={e => setDraftToken(e.target.value)} /></label>
          <button>Entrar</button>
        </form>
      </section>}
    </main>
    <footer>AguaIA · FISC AI Agents 2026 · Reto 1: Agua <span>Priorizar con evidencia. Decidir con supervisión.</span></footer>
  </>
}
