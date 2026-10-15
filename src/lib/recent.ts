export interface RecentSalon { slug: string; name: string; image: string | null; area: string | null }
const SALONS = 'lushira.recentSalons.v1'
const SEARCHES = 'lushira.recentSearches.v1'

const read = <T,>(key: string): T[] => {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[] } catch { return [] }
}
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ } }

export const getRecentSalons = () => read<RecentSalon>(SALONS)
export function addRecentSalon(s: RecentSalon) {
  write(SALONS, [s, ...getRecentSalons().filter((x) => x.slug !== s.slug)].slice(0, 8))
}
export const getRecentSearches = () => read<string>(SEARCHES)
export function addRecentSearch(q: string) {
  const t = q.trim()
  if (t.length < 2) return
  write(SEARCHES, [t, ...getRecentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8))
}
export const clearRecentSearches = () => write(SEARCHES, [])
