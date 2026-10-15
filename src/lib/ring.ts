import { useEffect, useRef, useState } from 'react'

const KEY = 'lushira_order_ring'
const VOL_KEY = 'lushira_order_ring_volume'
const SRC = '/sounds/ring.mp3'

export function useRingSetting() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })
  const set = (v: boolean) => { setOn(v); try { localStorage.setItem(KEY, v ? 'on' : 'off') } catch { /* ignore */ } }
  return [on, set] as const
}

/** Ring volume 0.1 – 1 (saved on this device). */
export function useRingVolume() {
  const [vol, setVol] = useState(() => { try { const v = parseFloat(localStorage.getItem(VOL_KEY) ?? ''); return v >= 0.1 && v <= 1 ? v : 0.8 } catch { return 0.8 } })
  const set = (v: number) => { setVol(v); try { localStorage.setItem(VOL_KEY, String(v)) } catch { /* ignore */ } }
  return [vol, set] as const
}

let el: HTMLAudioElement | null = null
function audio() {
  if (!el) { el = new Audio(SRC); el.preload = 'auto' }
  return el
}

/** Plays the ring tone once. Resolves false if the browser blocked it (needs a tap first). */
export async function playRing(volume = 0.8): Promise<boolean> {
  const a = audio()
  a.volume = Math.min(1, Math.max(0, volume))
  a.currentTime = 0
  try { await a.play(); try { navigator.vibrate?.([300, 150, 300]) } catch { /* ignore */ } return true } catch { return false }
}
export function stopRing() { if (el) { el.pause(); el.currentTime = 0 } }

/** Rings repeatedly while `active` (there are unanswered orders) and ring is enabled. */
export function useOrderRing(active: boolean, enabled: boolean, volume: number) {
  const [blocked, setBlocked] = useState(false)
  const vol = useRef(volume)
  vol.current = volume
  useEffect(() => { if (el) el.volume = volume }, [volume])
  useEffect(() => {
    // first tap anywhere unlocks audio playback on phones/desktop
    const unlock = () => { const a = audio(); a.muted = true; void a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; setBlocked(false) }).catch(() => { a.muted = false }) }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])
  useEffect(() => {
    if (!active || !enabled) { stopRing(); return }
    let stopped = false
    let timer: number | undefined
    const a = audio()
    const cycle = async () => {
      if (stopped) return
      const ok = await playRing(vol.current)
      setBlocked(!ok)
      if (!ok) { timer = window.setTimeout(() => void cycle(), 2000); return }
    }
    const onEnd = () => { if (!stopped) timer = window.setTimeout(() => void cycle(), 1200) }
    a.addEventListener('ended', onEnd)
    void cycle()
    return () => { stopped = true; a.removeEventListener('ended', onEnd); if (timer) window.clearTimeout(timer); stopRing() }
  }, [active, enabled])
  return { blocked }
}
