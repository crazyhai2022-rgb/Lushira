import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type Kind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: Kind; text: string }
interface Api { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }

const Ctx = createContext<Api | null>(null)
let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq
    setItems((x) => [...x.slice(-2), { id, kind, text }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500)
  }, [])
  const api = useMemo<Api>(
    () => ({ success: (t) => push('success', t), error: (t) => push('error', t), info: (t) => push('info', t) }),
    [push],
  )
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info }
  const tone = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-blush-300 bg-white text-plum-800',
  }
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.kind]
          return (
            <div key={t.id} className={`animate-pop pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${tone[t.kind]}`}>
              <I className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{t.text}</span>
              <button aria-label="Dismiss" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}>
                <X className="h-4 w-4 opacity-60" />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast must be inside ToastProvider')
  return v
}
