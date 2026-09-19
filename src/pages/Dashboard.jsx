import { useState, useEffect, useMemo, Suspense, lazy } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MainDashboard from '../components/Dashboard/MainDashboard'

const MyBookings = lazy(() => import('./MyBookings'))
const MyOrders = lazy(() => import('./MyOrders'))
const Notifications = lazy(() => import('../components/Dashboard/Notifications'))

const Dashboard = () => {
  const [authUser, setAuthUser] = useState(null)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [selectedCustomerSection, setSelectedCustomerSection] = useState('bookings')

  useEffect(() => {
    const syncAuth = () => {
      try {
        const raw = localStorage.getItem('authUser')
        setAuthUser(raw ? JSON.parse(raw) : null)
      } catch {
        setAuthUser(null)
      }
    }
    syncAuth()
    window.addEventListener('storage', syncAuth)
    window.addEventListener('auth-changed', syncAuth)
    return () => {
      window.removeEventListener('storage', syncAuth)
      window.removeEventListener('auth-changed', syncAuth)
    }
  }, [])

  const isCustomer = () => {
    if (!authUser) return false
    return (authUser.user_type || '').toLowerCase() === 'customer'
  }

  useEffect(() => {
    const sectionParam = searchParams.get('section')
    if (sectionParam === 'notifications') {
      setSelectedCustomerSection('notifications')
    } else if (sectionParam === 'invoices') {
      setSelectedCustomerSection('invoices')
    } else if (sectionParam === 'bookings') {
      setSelectedCustomerSection('bookings')
    }
  }, [searchParams])

  const CustomerSelectedComponent = useMemo(() => {
    if (selectedCustomerSection === 'notifications') return Notifications
    return selectedCustomerSection === 'invoices' ? MyBookings : MyOrders
  }, [selectedCustomerSection])

  if (authUser === null) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    )
  }

  if (isCustomer()) {
    const customerMenuItems = [
      { key: 'bookings', label: 'Bookings' },
      { key: 'invoices', label: 'Invoices' },
      { key: 'notifications', label: 'Notifications' },
    ]
    const SelectedComponent = CustomerSelectedComponent

    return (
      <div>
        <h1 className="sr-only">Customer Dashboard</h1>
        <div className="w-full flex justify-center">
          <h2 className="bg-white text-black text-center font-bold italic py-1 w-full">
            Customer Dashboard
          </h2>
        </div>
        <div className="min-h-screen bg-linear-to-br from-blue-50 to-pink-50 py-2 px-2 md:px-0">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-5 gap-8">
              <aside className="md:col-span-1">
                <div className="rounded-2xl shadow bg-white border border-gray-100 px-5 py-8 flex flex-col gap-2 md:min-h-[400px] mt-0">
                  {customerMenuItems.map((item) => {
                    const isSelected = selectedCustomerSection === item.key
                    return (
                      <button
                        key={item.key}
                        onClick={() => {
                          setSelectedCustomerSection(item.key)
                          navigate(`/dashboard?section=${item.key}`, { replace: true })
                        }}
                        className={
                          'w-full text-left px-3 py-0.5 rounded-lg mb-1 text-sm focus:outline-none transition-all ' +
                          (isSelected
                            ? 'font-bold bg-linear-to-r from-indigo-100 via-blue-100 to-pink-100 border-l-4 border-indigo-400 text-indigo-700 shadow-sm'
                            : 'font-normal text-gray-700 hover:bg-blue-50')
                        }
                      >
                        <span className="font-semibold">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </aside>

              <main className="md:col-span-4 flex flex-col gap-7">
                <div className="rounded-2xl shadow-md border border-gray-200 bg-white p-2 sm:p-3 mt-0 md:mt-0">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center p-8">
                        <div className="text-gray-500">Loading...</div>
                      </div>
                    }
                  >
                    <SelectedComponent />
                  </Suspense>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">Admin Dashboard</h1>
      <MainDashboard />
    </>
  )
}

export default Dashboard
