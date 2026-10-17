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
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ is_simulated: boolean }>('/health'),
  })

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            onClick={(e) => { e.preventDefault(); setPage('citizen') }}
            aria-label="AguaIA inicio"
          >
            <span className="brand-mark">💧</span>
            <span className="brand-text">Agua<strong>IA</strong></span>
            <span className="tag-panama">Panamá Oeste</span>
          </a>

          {page === 'coordination' && (
            <nav aria-label="Navegación principal">
              <button className="nav-tab" onClick={() => setPage('citizen')}>
                Ir al reporte ciudadano
              </button>
            </nav>
          )}
        </div>
      </header>

      {page === 'citizen' ? (
        health.data?.is_simulated && (
          <div className="demo-banner">
            <div className="banner-content">
              <span className="banner-text">
                <strong>Versión de demostración:</strong> los ejemplos de esta página son casos ficticios.
              </span>
            </div>
          </div>
        )
      ) : (
        <div className="demo-banner">
          <div className="banner-content">
            <span className="banner-dot" />
            {health.data ? (
              health.data.is_simulated ? (
                <span className="banner-text">
                  <strong>DEMO OFFLINE</strong> · Interpretación determinística verificada y reproducible (Sin costo de API)
                </span>
              ) : (
                <span className="banner-text">
                  <strong>MODO NVIDIA NIM</strong> · Inferencia real mediante microservicios NVIDIA NIM (DeepSeek / Kimi)
                </span>
              )
            ) : (
              <span className="banner-text">Conectando con el servicio de operaciones…</span>
            )}
            <span className="banner-divider">|</span>
            <span className="banner-note">Hackathon FISC AI Agents 2026 · UTP</span>
          </div>
        </div>
      )}

      <main className="main-content">
        <ErrorMessage error={health.error} />
        {page === 'citizen' ? (
          <CitizenPage />
        ) : token ? (
          <>
            <div className="session-bar">
              <div className="session-info">
                <span className="session-status-dot" />
                <span>Sesión activa de coordinación operativa</span>
                <span className="session-security-note">(Token protegido en memoria volátil de React)</span>
              </div>
              <button
                className="secondary exit-btn"
                onClick={() => {
                  setToken('')
                  client.removeQueries({ queryKey: ['admin'] })
                }}
              >
                Salir
              </button>
            </div>
            <CoordinationPage key={token} token={token} />
          </>
        ) : (
          <section className="card login-card stack">
            <div className="login-header">
              <span className="lock-icon">🔒</span>
              <h1>Acceso de coordinación</h1>
              <p className="muted">
                Área reservada para coordinadores de contingencia del IDAAN, SINAPROC o municipios de Arraiján y La Chorrera.
              </p>
            </div>

            <div className="callout info">
              Introduce el token configurado para esta demostración. Se conserva solo en memoria de sesión mientras esta pestaña está abierta.
            </div>

            <form
              className="stack"
              onSubmit={e => {
                e.preventDefault()
                client.removeQueries({ queryKey: ['admin'] })
                setToken(draftToken)
                setDraftToken('')
              }}
            >
              <label>
                Token de coordinación
                <input
                  required
                  type="password"
                  autoComplete="off"
                  minLength={16}
                  value={draftToken}
                  onChange={e => setDraftToken(e.target.value)}
                  placeholder="Introduce el COORDINATOR_TOKEN configurado..."
                />
              </label>
              <button type="submit" className="login-submit-btn">
                Entrar
              </button>
            </form>

            <div className="login-footer-hint">
              <small className="muted">
                ¿Prueba local? Consulta el valor de <code>COORDINATOR_TOKEN</code> en tu archivo <code>.env</code>.
              </small>
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <div className="footer-left">
            <strong>AguaIA</strong> · Hackathon FISC AI Agents 2026 · Reto 1: Crisis del Agua en Panamá Oeste
          </div>
          {page === 'citizen' ? (
            <button type="button" className="link-btn" onClick={() => setPage('coordination')}>
              Acceso para coordinadores
            </button>
          ) : (
            <div className="footer-motto">
              <span>Priorizar con evidencia matemática. Decidir con supervisión humana.</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
