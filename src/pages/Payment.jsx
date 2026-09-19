import React, { useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AlertModal from '../components/AlertModal'

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-checkout-js')) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.id = 'razorpay-checkout-js'
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

const Payment = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const paymentData = location.state || {}
  const [alertState, setAlertState] = useState({ open: false, type: 'info', message: '' })
  const showAlert = useCallback((message, type = 'info') => {
    setAlertState({ open: true, type, message: String(message) })
  }, [])
  const closeAlert = useCallback(() => setAlertState(prev => ({ ...prev, open: false })), [])

  useEffect(() => {
    const openCheckout = async () => {
      // Check if payment data exists
      if (!paymentData || !paymentData.amount) {
        showAlert('No payment data found. Please complete your booking first.', 'warning')
        navigate('/senior-care')
        return
      }

      const loaded = await loadRazorpayScript()
      if (!loaded) {
        showAlert('Payment SDK failed to load. Please check your network.', 'error')
        return
      }

      const amountInPaise = Math.max(1, Math.floor((paymentData.amount || 499) * 100))

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_1DP5mmOlF5G5ag',
        amount: amountInPaise,
        currency: 'INR',
        name: paymentData.merchantName || 'Vaishnavi Medicare',
        description: paymentData.description || 'Senior Care Booking',
        image: paymentData.logo || undefined,
        handler: function (response) {
          showAlert('Payment successful! Payment ID: ' + response.razorpay_payment_id, 'success')
          navigate('/my-bookings', { 
            state: { 
              paymentSuccess: true, 
              paymentId: response.razorpay_payment_id,
              paymentData: paymentData
            } 
          })
        },
        prefill: {
          name: paymentData.customerName || 'Customer',
          email: paymentData.customerEmail || '',
          contact: paymentData.customerPhone || '9999999999'
        },
        theme: {
          color: '#14b8a6' // Teal color matching your theme
        },
        modal: {
          ondismiss: function() {
            navigate(-1)
          }
        }
      }

      // eslint-disable-next-line no-undef
      const rzp = new window.Razorpay(options)
      
      rzp.on('payment.failed', function (response) {
        console.error('Payment Failed:', response.error)
        showAlert('Payment failed: ' + (response.error.description || 'Please try again'), 'error')
        navigate(-1)
      })

      rzp.open()
    }

    openCheckout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
    <div className="min-h-screen grid place-items-center bg-gray-50 px-4 py-10">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Opening Payment Gateway...</h1>
        <p className="text-gray-600 mt-2">Please wait while we redirect you to Razorpay's secure payment gateway.</p>
        <p className="text-sm text-gray-500 mt-4">
          If the payment popup didn't appear, please check your browser's popup blocker settings.
        </p>
        <div className="mt-6 space-y-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full inline-flex items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
          >
            Retry Payment
          </button>
          <button
            onClick={() => navigate(-1)}
            className="w-full inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
          >
            Go Back
          </button>
        </div>
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">
            <strong>Test Mode:</strong> Use test card: 4111 1111 1111 1111, CVV: Any 3 digits, Expiry: Any future date
          </p>
        </div>
      </div>
    </div>
    <AlertModal open={alertState.open} type={alertState.type} message={alertState.message} onClose={closeAlert} />
    </>
  )
}

export default Payment
