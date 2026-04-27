import { StrictMode, Component } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './context/AppContext'

interface EBState { hasError: boolean; error?: Error }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false }
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error } }
  componentDidCatch(error: Error, info: any) { console.error('[Mesh] Crash React:', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#1e1f22', color:'#fff', gap:16, fontFamily:'sans-serif' }}>
          <div style={{ fontSize:48 }}>error</div>
          <div style={{ fontSize:20, fontWeight:600 }}>Mesh a rencontre une erreur</div>
          <div style={{ color:'#80848e', fontSize:14, maxWidth:400, textAlign:'center' }}>
            {this.state.error?.message || 'Erreur inattendue'}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
            style={{ marginTop:8, padding:'10px 24px', borderRadius:8, background:'#5865f2', color:'#fff', border:'none', cursor:'pointer', fontSize:15 }}
          >
            Redemarrer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
)
