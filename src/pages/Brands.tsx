import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Store } from 'lucide-react'
import { supabase, publicUrl } from '../lib/supabase'
import { getBrands } from '../lib/api'
import { CardSkeletonGrid, EmptyState, ErrorState, PageHero } from '../components/ui'
import { inr } from '../lib/format'

export default function Brands() {
  const [sp, setSp] = useSearchParams()
  const sel = sp.get('brand')
  const brands = useQuery({ queryKey: ['brands'], queryFn: getBrands })
  const brand = brands.data?.find((b) => b.slug === sel)
  const salons = useQuery({
    queryKey: ['brand-salons', brand?.id], enabled: !!brand,
    queryFn: async () => {
      const r = await supabase.from('salon_brand_services')
        .select('id,brand_services!inner(id,name,price_inr,brand_id),salons!inner(id,name,slug,area,city,logo_url,status)')
        .eq('verified', true).eq('brand_services.brand_id', brand!.id)
      if (r.error) throw r.error
      return (r.data ?? []) as unknown as { id: string; brand_services: { id: string; name: string; price_inr: number | null }; salons: { id: string; name: string; slug: string; area: string | null; city: string | null; logo_url: string | null } }[]
    },
  })
  return (
    <>
      <PageHero eyebrow="Trusted brands" title="Brand services" subtitle="Salons listed under a brand are verified by Lushira. We never show a brand on a salon without verification." />
      <div className="container-x py-8">
        {brands.isLoading ? <CardSkeletonGrid count={4} /> : brands.isError ? <ErrorState onRetry={() => brands.refetch()} /> :
          (brands.data?.length ?? 0) === 0 ? <EmptyState icon={<BadgeCheck className="h-6 w-6" />} title="No brands listed yet" text="Brand partnerships will appear here once they are verified by our team." /> : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {brands.data!.map((b) => (
                  <button key={b.id} onClick={() => setSp(sel === b.slug ? {} : { brand: b.slug })} aria-pressed={sel === b.slug}
                    className={`card p-4 text-center transition hover:shadow-md ${sel === b.slug ? 'ring-2 ring-lush-600' : ''}`}>
                    {b.logo_url ? <img src={publicUrl(b.logo_url)!} alt="" className="mx-auto h-14 object-contain" /> : <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blush-100 font-display text-xl text-lush-600">{b.name[0]}</div>}
                    <p className="mt-2 font-semibold">{b.name}</p>
                    <p className="text-xs text-muted">{b.brand_services?.length ?? 0} services</p>
                  </button>))}
              </div>
              {brand && (
                <section className="mt-8">
                  <h2 className="section-title">{brand.name} — available at</h2>
                  {brand.description && <p className="mt-1 text-sm text-muted">{brand.description}</p>}
                  <div className="mt-4">
                    {salons.isLoading ? <CardSkeletonGrid count={3} className="h-24" /> : (salons.data?.length ?? 0) === 0 ? (
                      <EmptyState icon={<Store className="h-6 w-6" />} title="No verified salons yet" text={`No salon near you has a verified ${brand.name} service right now.`} />
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {salons.data!.map((r) => (
                          <Link key={r.id} to={`/salon/${r.salons.slug}`} className="card flex items-center gap-3 p-4 hover:shadow-md">
                            <img src={publicUrl(r.salons.logo_url) ?? '/icons/icon-192.png'} alt="" className="h-12 w-12 rounded-xl object-cover" />
                            <div className="min-w-0"><p className="truncate font-semibold">{r.salons.name}</p>
                              <p className="truncate text-xs text-muted">{r.brand_services.name}{r.brand_services.price_inr != null && ` · ${inr(r.brand_services.price_inr)}`}</p>
                              <p className="inline-flex items-center gap-1 text-xs text-green-700"><BadgeCheck className="h-3.5 w-3.5" />Verified</p></div>
                          </Link>))}
                      </div>)}
                  </div>
                </section>)}
            </>)}
      </div>
    </>
  )
}
