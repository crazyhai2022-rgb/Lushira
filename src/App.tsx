import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout, { RequireAuth } from './components/Layout'
import { Spinner } from './components/ui'
import Home from './pages/Home'
import Categories from './pages/Categories'
import Services from './pages/Services'
import ServiceDetails from './pages/ServiceDetails'
import { About, Contact, Faq, Help, Privacy, Refund, Terms, NotFound, Forbidden } from './pages/Static'
import PartnerLanding from './pages/partner/PartnerLanding'
import PartnerShell from './pages/partner/PartnerShell'

const Salons = lazy(() => import('./pages/Salons'))
const SalonDetails = lazy(() => import('./pages/SalonDetails'))
const Wedding = lazy(() => import('./pages/Wedding'))
const Brands = lazy(() => import('./pages/Brands'))
const Checkout = lazy(() => import('./pages/Checkout'))
const Orders = lazy(() => import('./pages/Orders'))
const Auth = lazy(() => import('./pages/Auth'))
const ThankYou = lazy(() => import('./pages/ThankYou'))
const Profile = lazy(() => import('./pages/Profile'))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation'))
const Tracking = lazy(() => import('./pages/Tracking'))
const TrackList = lazy(() => import('./pages/Tracking').then((m) => ({ default: m.TrackList })))
const PartnerRegister = lazy(() => import('./pages/partner/PartnerRegister'))
const PartnerDashboard = lazy(() => import('./pages/partner/PartnerDashboard'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))

const Fallback = () => <div className="flex h-[50vh] items-center justify-center text-lush-600"><Spinner className="h-8 w-8" /></div>

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="categories" element={<Categories />} />
          <Route path="services" element={<Services />} />
          <Route path="service/:id" element={<ServiceDetails />} />
          <Route path="salons" element={<Salons />} />
          <Route path="salon/:slug" element={<SalonDetails />} />
          <Route path="wedding" element={<Wedding />} />
          <Route path="brands" element={<Brands />} />
          <Route path="cart" element={<Checkout />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="order/:id" element={<RequireAuth><OrderConfirmation /></RequireAuth>} />
          <Route path="orders" element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path="track" element={<RequireAuth><TrackList /></RequireAuth>} />
          <Route path="track/:id" element={<RequireAuth><Tracking /></RequireAuth>} />
          <Route path="thank-you/:id" element={<RequireAuth><ThankYou /></RequireAuth>} />
          <Route path="login" element={<Auth mode="login" />} />
          <Route path="signup" element={<Auth mode="signup" />} />
          <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="faq" element={<Faq />} />
          <Route path="help" element={<Help />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="refund-policy" element={<Refund />} />
          <Route path="partner" element={<PartnerLanding />} />
          <Route path="admin" element={<RequireAuth role="admin"><AdminDashboard /></RequireAuth>} />
          <Route path="403" element={<Forbidden />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route element={<PartnerShell />}>
          <Route path="partner/register" element={<PartnerRegister />} />
          <Route path="partner/login" element={<Auth mode="login" partner defaultNext="/partner/dashboard" />} />
          <Route path="partner/dashboard" element={<RequireAuth role="partner" loginPath="/partner/login"><PartnerDashboard /></RequireAuth>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
