import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck } from 'lucide-react'
import { getCategories } from '../lib/api'
import { CategoryCard } from '../components/cards'
import { CardSkeletonGrid, ErrorState, PageHero } from '../components/ui'

export default function Categories() {
  const q = useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: 10 * 60 * 1000 })
  return (
    <>
      <PageHero eyebrow="Our services" title="Categories" subtitle="Look good · Feel confident · Be you" image="/img/hero-beauty.jpg">
        <nav aria-label="Breadcrumb" className="text-xs text-muted"><Link to="/" className="hover:underline">Home</Link> › Categories</nav>
      </PageHero>
      <div className="container-x py-10">
        <div className="mx-auto mb-8 max-w-xl text-center">
          <h2 className="section-title">Explore Our Categories</h2>
          <p className="mt-2 text-sm text-muted">From skincare to haircare, makeup to wellness — discover the full range of beauty services from salons near you.</p>
        </div>
        {q.isLoading ? <CardSkeletonGrid count={8} className="h-64" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{q.data!.map((c) => <CategoryCard key={c.id} c={c} />)}</div>
        )}
        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl bg-blush-200 p-6 sm:flex-row sm:items-center">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lush-600">Your beauty · our priority</p><h3 className="font-display text-2xl font-semibold">Book Your Appointment Today</h3><p className="text-sm text-muted">Because you deserve the best care!</p></div>
          <Link to="/services" className="btn btn-primary"><CalendarCheck className="h-4 w-4" />Book Now</Link>
        </div>
      </div>
    </>
  )
}
