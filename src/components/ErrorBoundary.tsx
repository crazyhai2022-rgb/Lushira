import { Component, type ReactNode } from 'react'

/** Never show a blank page: on a render/chunk-load error, offer a one-tap refresh that also clears the stale app cache. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) {
    console.error(err)
    const stale = /Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(String(err?.message))
    if (stale && !sessionStorage.getItem('lushira_reloaded')) { sessionStorage.setItem('lushira_reloaded', '1'); void this.refresh() }
  }
  refresh = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      await Promise.all((regs ?? []).map((r) => r.unregister()))
      const keys = await caches?.keys?.()
      await Promise.all((keys ?? []).map((k) => caches.delete(k)))
    } catch { /* ignore */ }
    location.reload()
  }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif', background: '#fff7f9', color: '#3c0f29' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ margin: '8px 0 16px', fontSize: 14, opacity: .75 }}>The page could not load. Tap refresh to load the latest version.</p>
          <button onClick={() => void this.refresh()} style={{ background: '#c4416f', color: '#fff', border: 0, borderRadius: 999, padding: '10px 22px', fontWeight: 600 }}>Refresh</button>
        </div>
      </div>)
  }
}
