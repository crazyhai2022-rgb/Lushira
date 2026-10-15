import { useEffect, useRef, useState } from 'react'

const KEY = 'lushira_order_ring'
export function useRingSetting() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })
  const set = (v: boolean) => { setOn(v); try { localStorage.setItem(KEY, v ? 'on' : 'off') } catch { /* ignore */ } }
  return [on, set] as const
}

let ctx: AudioContext | null = null
function audio() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx = ctx ?? new AC()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}
/** One phone-style "ring-ring" (two double-beeps). */
export function playRing() {
  const c = audio()
  if (!c) return
  const t0 = c.currentTime + 0.02
  ;[0, 0.22, 0.9, 1.12].forEach((o) => {
    const osc = c.createOscillator(), g = c.createGain()
    osc.type = 'sine'; osc.frequency.value = 880
    g.gain.setValueAtTime(0.0001, t0 + o); g.gain.exponentialRampToValueAtTime(0.35, t0 + o + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o + 0.18)
    osc.connect(g).connect(c.destination); osc.start(t0 + o); osc.stop(t0 + o + 0.2)
  })
  try { navigator.vibrate?.([200, 100, 200]) } catch { /* ignore */ }
}

/** Rings repeatedly while `active` (there are unanswered orders) and ring is enabled. Unlocks audio on first tap. */
export function useOrderRing(active: boolean, enabled: boolean) {
  const [blocked, setBlocked] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    const unlock = () => { audio(); setBlocked(false) }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    if (!active || !enabled) return
    const tick = () => { playRing(); setBlocked(ctx?.state !== 'running') }
    tick()
    timer.current = window.setInterval(tick, 3500)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [active, enabled])
  return { blocked }
}
