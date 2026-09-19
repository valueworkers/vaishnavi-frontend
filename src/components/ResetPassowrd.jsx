import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import './Login.css'

/** Non-empty string from API `message` or `error` (success or error bodies). */
function pickMessageOrError(data) {
  if (!data || typeof data !== 'object') return ''
  const raw = data.message ?? data.error
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return ''
}

/** Error copy: prefer `message` / `error`, then `detail`, then field errors. */
function pickApiErrorText(apiError) {
  const d = apiError?.response?.data
  const fromMsg = pickMessageOrError(d)
  if (fromMsg) return fromMsg
  if (typeof d?.detail === 'string' && d.detail.trim()) return d.detail.trim()
  if (Array.isArray(d?.detail) && d.detail.length) return String(d.detail[0])
  for (const key of ['email', 'otp', 'new_password', 'confirm_password', 'reset_token']) {
    const v = d?.[key]
    if (Array.isArray(v) && v[0]) return String(v[0])
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return 'Something went wrong. Please try again.'
}

export default function ResetPassowrd() {
  const navigate = useNavigate()
  const [contact, setContact] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [successNotice, setSuccessNotice] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showCf, setShowCf] = useState(false)
  const [timer, setTimer] = useState(30)
  const [canResend, setCanResend] = useState(false)
  /** Which channel is currently calling request-otp; null when idle. */
  const [otpRequestInFlight, setOtpRequestInFlight] = useState(null)
  /** How OTP was requested; used for resend payload. 'email' = body `{ email }` only. */
  const [lastOtpChannel, setLastOtpChannel] = useState(null)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const otpRefs = useRef([])

  useEffect(() => {
    if (step !== 2) return undefined
    setTimer(30)
    setCanResend(false)
    const id = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(id)
          setCanResend(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [step])

  const buildRequestOtpPayload = (channel) => {
    const email = contact.trim()
    if (channel === 'sms') return { email, channel: 'sms' }
    if (channel === 'whatsapp') return { email, channel: 'whatsapp' }
    return { email }
  }

  const requestOtp = async (stayOnOtpStep = false, channel = 'email') => {
    if (!contact.trim()) {
      setSuccessNotice('')
      setError('Please enter your email.')
      return false
    }
    try {
      setOtpRequestInFlight(channel)
      setError('')
      setSuccessNotice('')
      const response = await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/request-otp/`,
        buildRequestOtpPayload(channel)
      )
      setLastOtpChannel(channel)
      const ok = pickMessageOrError(response.data)
      if (ok) setSuccessNotice(ok)
      if (stayOnOtpStep) {
        setOtp(['', '', '', '', '', ''])
        setStep(2)
      } else {
        setStep(2)
      }
      return true
    } catch (apiError) {
      setSuccessNotice('')
      setError(pickApiErrorText(apiError))
      return false
    } finally {
      setOtpRequestInFlight(null)
    }
  }

  const goNext = async () => {
    if (step === 2) {
      const otpValue = otp.join('').trim()
      if (otpValue.length < 6) {
        setSuccessNotice('')
        setError('Please enter a valid OTP.')
        return
      }
      try {
        setIsVerifyingOtp(true)
        setError('')
        setSuccessNotice('')
        const response = await axios.post(`${import.meta.env.VITE_BASEURL_CARE}/accounts/verify-otp/`, {
          email: contact.trim(),
          otp: otpValue,
        })
        const data = response.data || {}
        const token =
          data.reset_token ??
          data.resetToken ??
          data.data?.reset_token ??
          data.data?.resetToken
        if (!token) {
          const apiHint = pickMessageOrError(data)
          setError(apiHint || 'Verification succeeded but no reset token was returned. Please try again.')
          return
        }
        const ok = pickMessageOrError(data)
        if (ok) setSuccessNotice(ok)
        setResetToken(token)
        setStep(3)
      } catch (apiError) {
        setSuccessNotice('')
        setError(pickApiErrorText(apiError))
      } finally {
        setIsVerifyingOtp(false)
      }
      return
    }
    if (step === 3) {
      if (password.length < 6) {
        setSuccessNotice('')
        setError('Password must be at least 6 characters.')
        return
      }
      if (password !== confirmPassword) {
        setSuccessNotice('')
        setError('Passwords do not match.')
        return
      }
      if (!resetToken) {
        setSuccessNotice('')
        setError('Session expired. Please verify OTP again.')
        return
      }
      try {
        setIsResettingPassword(true)
        setError('')
        setSuccessNotice('')
        const response = await axios.post(`${import.meta.env.VITE_BASEURL_CARE}/accounts/password-reset/`, {
          reset_token: resetToken,
          new_password: password,
          confirm_password: confirmPassword,
        })
        const ok = pickMessageOrError(response.data)
        if (ok) {
          setSuccessNotice(ok)
          await new Promise((r) => setTimeout(r, 1800))
        }
        navigate('/login')
      } catch (apiError) {
        setSuccessNotice('')
        setError(pickApiErrorText(apiError))
      } finally {
        setIsResettingPassword(false)
      }
      return
    }
    setError('')
    setStep((prev) => prev + 1)
  }

  const handleOtpChange = (index, value) => {
    if (!/^[0-9]?$/.test(value)) return
    const next = [...otp]
    next[index] = value
    setOtp(next)
    if (value && index < 5) otpRefs.current[index + 1]?.focus()
  }

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: 420 }}>
        <div className="login-header">
          <h2>Reset Password</h2>
          <p>
            {step === 1
              ? 'Enter your email or mobile to receive an OTP'
              : step === 2
                ? 'Verify OTP sent to your contact'
                : 'Create your new password'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginLeft: -6 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {step > n ? (
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                ) : (
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: step >= n ? '#14b8a6' : '#e2e8f0', color: step >= n ? '#fff' : '#64748b', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {n}
                  </span>
                )}
                <span style={{ marginTop: 3, marginLeft: 50,  fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                  {n === 1 ? 'Identify' : n === 2 ? 'Verify OTP' : 'New Password'}
                </span>
              </div>
              {n < 3 && <span style={{ flex: 1, height: 1, margin: '0 8px', background: step > n ? '#22c55e' : '#cbd5e1' }} />}
            </div>
          ))}
        </div>

        <div className="login-form" style={{ gap: 10 }}>
          {step === 1 && (
            <>
              <div className="form-group">
                <label>Email</label>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: 8, width: '100%', alignItems: 'stretch' }}>
                <button
                  type="button"
                  className={`login-button${otpRequestInFlight === 'sms' ? ' login-button--loading' : ''}`}
                  style={{ flex: 1, minWidth: 0, paddingLeft: 8, paddingRight: 8, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25 }}
                  disabled={otpRequestInFlight !== null}
                  onClick={() => requestOtp(false, 'sms')}
                >
                  {otpRequestInFlight === 'sms' ? 'Requesting…' : 'Request OTP on SMS'}
                </button>
                <button
                  type="button"
                  className={`login-button${otpRequestInFlight === 'whatsapp' ? ' login-button--loading' : ''}`}
                  style={{ flex: 1, minWidth: 0, paddingLeft: 8, paddingRight: 8, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25 }}
                  disabled={otpRequestInFlight !== null}
                  onClick={() => requestOtp(false, 'whatsapp')}
                >
                  {otpRequestInFlight === 'whatsapp' ? 'Requesting…' : 'Request OTP on WhatsApp'}
                </button>
                <button
                  type="button"
                  className={`login-button${otpRequestInFlight === 'email' ? ' login-button--loading' : ''}`}
                  style={{ flex: 1, minWidth: 0, paddingLeft: 8, paddingRight: 8, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25 }}
                  disabled={otpRequestInFlight !== null}
                  onClick={() => requestOtp(false, 'email')}
                >
                  {otpRequestInFlight === 'email' ? 'Requesting…' : 'Request OTP on Email'}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="form-group">
                <label>Enter 6-digit OTP</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      otpRefs.current[index] = el
                    }}
                    value={digit}
                    maxLength={1}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    style={{
                      width: 46,
                      height: 44,
                      borderRadius: 8,
                      border: '1.5px solid #edf1f5',
                      textAlign: 'center',
                      fontSize: 16,
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                ))}
              </div>
              <p style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                {canResend ? (
                  <button
                    type="button"
                    className="forgot-password"
                    disabled={otpRequestInFlight !== null}
                    onClick={() => requestOtp(true, lastOtpChannel || 'email')}
                  >
                    {otpRequestInFlight !== null ? 'Resending OTP...' : 'Resend OTP'}
                  </button>
                ) : (
                  <>Resend in <span style={{ fontWeight: 700, color: '#1f2937' }}>{timer}s</span></>
                )}
              </p>
                <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setOtp(['', '', '', '', '', ''])
                  setLastOtpChannel(null)
                  setError('')
                  setSuccessNotice('')
                }}
                className="forgot-password"
                style={{ width: '100%', textAlign: 'center' }}
              >
                ← Change Email/Mobile
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="form-group">
                <label>New Password</label>
                <div className="password-input-container">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((prev) => !prev)}
                    className="password-toggle"
                  >
                    {showPw ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <div className="password-input-container">
                  <input
                    type={showCf ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCf((prev) => !prev)}
                    className="password-toggle"
                  >
                    {showCf ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {successNotice && (
          <div className="success-popup">
            <div className="success-icon">✓</div>
            <div className="success-text">{successNotice}</div>
          </div>
        )}
        {error && <div className="error-message general-error">{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {step > 1 && (
            <button
              type="button"
              onClick={() => {
                setStep((prev) => {
                  if (prev === 3) setResetToken('')
                  if (prev === 2) setLastOtpChannel(null)
                  return prev - 1
                })
                setError('')
                setSuccessNotice('')
              }}
              className="login-button"
              style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', boxShadow: 'none' }}
            >
              Back
            </button>
          )}
          {step !== 1 && (
            <button
              type="button"
              onClick={goNext}
              className={`login-button${
                (step === 2 && isVerifyingOtp) || (step === 3 && isResettingPassword)
                  ? ' login-button--loading'
                  : ''
              }`}
              style={{ flex: 1 }}
              disabled={
                (step === 2 && isVerifyingOtp) ||
                (step === 3 && isResettingPassword)
              }
            >
              {step === 2
                ? isVerifyingOtp
                  ? 'Verifying OTP...'
                  : 'Verify OTP'
                : isResettingPassword
                  ? 'Resetting...'
                  : 'Reset and Login'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
