import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './Login.css'
import axios from 'axios'

const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [isSignup, setIsSignup] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    middleName: '',
    lastName: '',
    mobileNumber: '',
    gender: '',
    address: '',
    city: '',
  })
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)


  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  // If already logged in, redirect home
  useEffect(() => {
    const authUserRaw = localStorage.getItem('authUser')
    if (authUserRaw) {
      navigate('/')
    }
  }, [navigate])

  useEffect(() => {
    const requestedMode = location.state?.authMode
    if (requestedMode === 'signup' || requestedMode === 'login') {
      setIsSignup(requestedMode === 'signup')
      // Consume router state once so in-page toggle is not overridden repeatedly.
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state?.authMode, location.pathname, navigate])

  const validateForm = () => {
    const newErrors = {}

    if (isSignup) {
      // Signup validation
      if (!formData.firstName) {
        newErrors.firstName = 'First name is required'
      }

      if (!formData.lastName) {
        newErrors.lastName = 'Last name is required'
      }

      // Middle name is optional - no validation needed

      if (!formData.gender) {
        newErrors.gender = 'Gender is required'
      }

      if (!formData.address) {
        newErrors.address = 'Address is required'
      }

      if (!formData.city) {
        newErrors.city = 'City is required'
      }

      if (!formData.mobileNumber) {
        newErrors.mobileNumber = 'Mobile number is required'
      } else if (!/^\d{10}$/.test(formData.mobileNumber)) {
        newErrors.mobileNumber = 'Mobile number must be 10 digits'
      }

      if (!formData.password) {
        newErrors.password = 'Password is required'
      } else if (formData.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters'
      }

      if (!formData.confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password'
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match'
      }
    } else {
      // Login validation
      if (!formData.password) {
        newErrors.password = 'Password is required'
      }
    }

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    
    // Validate form before making API call
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    setErrors({}) // Clear any previous errors
    
    try {
      const response = await axios.post(`${import.meta.env.VITE_BASEURL_CARE}/accounts/login/`, {
        username: formData.email,
        password: formData.password,
      })
      
      if (response.data.message === `Login successful as ${response.data.user.user_type}`) {
        // Store user data in localStorage
        const userData = {
          id: response.data.user.id,
          email: response.data.user.email,
          mobile_number: response.data.user.mobile_number,
          first_name: response.data.user.first_name,
          last_name: response.data.user.last_name,
          middle_name: response.data.user.middle_name,
          profile_pic: response.data.user.profile_pic || response.data.profile_pic || null,
          profile_picture: response.data.user.profile_picture || response.data.profile_picture || null,
          avatar: response.data.user.avatar || response.data.avatar || null,
          user_type: response.data.user.user_type,
          address: response.data.user.address,
          city: response.data.user.city,
          gender:response.data.user.gender,
          has_venues: response.data.user.has_venues,
          has_services: response.data.user.has_services,
          has_resources: response.data.user.has_resources
        }
        
        // Store tokens if available
        if (response.data.tokens) {
          const tokens = {
            access_token: response.data.tokens.access,
            refresh_token: response.data.tokens.refresh
          }
          localStorage.setItem('authTokens', JSON.stringify(tokens))
          localStorage.setItem('refresh_token', response.data.tokens.refresh)
          localStorage.setItem('access_token', response.data.tokens.access)
        }
        
        // Store user data
        localStorage.setItem('authUser', JSON.stringify(userData))
        localStorage.setItem('user_type', userData.user_type)
        // Notify other components about auth change
        window.dispatchEvent(new Event('auth-changed'))
        
        // Reset form
        setFormData({ username: '', email: '', password: '', confirmPassword: '', firstName: '', middleName: '', lastName: '', mobileNumber: '', gender: '', address: '', city: '' })
        
        // Redirect to home
        navigate('/')
        
      } else {
        setErrors({ general: 'Login failed. Please try again.' })
      }
      
    } catch (error) {
      console.error('Login error:', error)
      
      // Handle different types of errors
      if (error.response) {
        // Server responded with error status
        if (error.response.status === 401) {
          setErrors({ general: 'Invalid email or password' })
        } else if (error.response.status === 400) {
          setErrors({ general: 'Please check your credentials and try again' })
        } else {
          setErrors({ general: 'Login failed. Please try again.' })
        }
      } else if (error.request) {
        // Network error
        setErrors({ general: 'Network error. Please check your connection and try again.' })
      } else {
        // Other error
        setErrors({ general: 'Login failed. Please try again.' })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    
    // Validate form before making API call
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    setErrors({}) // Clear any previous errors
    
    try {
      // Prepare signup data
      const signupData = {
        email: formData.email,
        password: formData.password,
        confirm_password: formData.confirmPassword,
        first_name: formData.firstName,
        middle_name: formData.middleName || '',
        last_name: formData.lastName,
        mobile_number: formData.mobileNumber,
        gender: formData.gender,
        address: formData.address,
        city: formData.city,
      }
      
       // Api for the Signup
       const response = await axios.post(`${import.meta.env.VITE_BASEURL_CARE}/accounts/register/customer/`, signupData)
       
       if (response.data.message === "Registration successful" || response.status === 201) {
         // Reset form
         setFormData({ username: '', email: '', password: '', confirmPassword: '', firstName: '', middleName: '', lastName: '', mobileNumber: '', gender: '', address: '', city: '' })
         
         // Switch to login mode
         setIsSignup(false)
         
         // Show success popup
         setErrors({ success: 'Account created successfully! Please sign in.' })
         
         // Clear success message after 3 seconds
         setTimeout(() => {
           setErrors({})
         }, 3000)
         
       } else {
         setErrors({ general: 'Registration failed. Please try again.' })
       }
      
    } catch (error) {
      console.error('Signup error:', error)
      
      // Handle different types of errors
      if (error.response) {
        // Server responded with error status
        if (error.response.status === 400) {
          if (error.response.data?.email) {
            setErrors({ email: 'Email already exists. Please use a different email.' })
          } else if (error.response.data?.mobile_number) {
            setErrors({ mobileNumber: 'Mobile number already exists. Please use a different number.' })
          } else {
            setErrors({ general: 'Please check your information and try again.' })
          }
        } else if (error.response.status === 422) {
          setErrors({ general: 'Invalid data provided. Please check all fields.' })
        } else {
          setErrors({ general: 'Registration failed. Please try again.' })
        }
      } else if (error.request) {
        // Network error
        setErrors({ general: 'Network error. Please check your connection and try again.' })
      } else {
        // Other error
        setErrors({ general: 'Registration failed. Please try again.' })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e) => {
    if (isSignup) {
      handleSignup(e)
    } else {
      handleLogin(e)
    }
  }

  return (
    <div className="login-container">
      <div className={`login-card ${isSignup ? 'signup-card' : ''}`}>
        <div className="login-header">
          <h2>{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
          <p>{isSignup ? 'Sign up for a new account' : 'Sign in to your account'}</p>
        </div>

        <form onSubmit={handleSubmit} className={`login-form ${isSignup ? 'signup-form' : ''}`}>
          {errors.success && (
            <div className="success-popup">
              <div className="success-icon">✓</div>
              <div className="success-text">{errors.success}</div>
            </div>
          )}
          
          {errors.general && (
            <div className="error-message general-error">
              {errors.general}
            </div>
          )}

          {isSignup ? (
            <div className="signup-form-grid">
              <div className="form-group">
                <label htmlFor="firstName">First Name <span className="required">*</span></label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  placeholder="Enter your first name"
                  className={errors.firstName ? 'error' : ''}
                  required
                />
                {errors.firstName && <span className="error-text">{errors.firstName}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="lastName">Last Name <span className="required">*</span></label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  placeholder="Enter your last name"
                  className={errors.lastName ? 'error' : ''}
                  required
                />
                {errors.lastName && <span className="error-text">{errors.lastName}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="middleName">Middle Name (Optional)</label>
                <input
                  type="text"
                  id="middleName"
                  name="middleName"
                  value={formData.middleName || ''}
                  onChange={handleInputChange}
                  placeholder="Enter your middle name"
                  className={errors.middleName ? 'error' : ''}
                />
                {errors.middleName && <span className="error-text">{errors.middleName}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="gender">Gender <span className="required">*</span></label>
                <select
                  id="gender"
                  name="gender"
                  value={formData.gender || ''}
                  onChange={handleInputChange}
                  className={errors.gender ? 'error' : ''}
                  required
                >
                  <option value="">Select gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
                {errors.gender && <span className="error-text">{errors.gender}</span>}
              </div>

              <div className="form-group signup-form-full-width">
                <label htmlFor="address">Address <span className="required">*</span></label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={formData.address || ''}
                  onChange={handleInputChange}
                  placeholder="Enter your address"
                  className={errors.address ? 'error' : ''}
                  required
                />
                {errors.address && <span className="error-text">{errors.address}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="city">City <span className="required">*</span></label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city || ''}
                  onChange={handleInputChange}
                  placeholder="Enter your city"
                  className={errors.city ? 'error' : ''}
                  required
                />
                {errors.city && <span className="error-text">{errors.city}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="mobileNumber">Mobile Number <span className="required">*</span></label>
                <input
                  type="tel"
                  id="mobileNumber"
                  name="mobileNumber"
                  value={formData.mobileNumber}
                  onChange={handleInputChange}
                  placeholder="Enter your mobile number"
                  className={errors.mobileNumber ? 'error' : ''}
                  required
                />
                {errors.mobileNumber && <span className="error-text">{errors.mobileNumber}</span>}
              </div>

              <div className="form-group signup-form-full-width">
                <label htmlFor="email">Email Address <span className="required">*</span></label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email"
                  className={errors.email ? 'error' : ''}
                  required
                />
                {errors.email && <span className="error-text">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="password">Password <span className="required">*</span></label>
                <div className="password-input-container">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Enter your password"
                    className={errors.password ? 'error' : ''}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && <span className="error-text">{errors.password}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password <span className="required">*</span></label>
                <div className="password-input-container">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="Confirm your password"
                    className={errors.confirmPassword ? 'error' : ''}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
              </div>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email"
                  className={errors.email ? 'error' : ''}
                />
                {errors.email && <span className="error-text">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="password-input-container">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Enter your password"
                    className={errors.password ? 'error' : ''}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && <span className="error-text">{errors.password}</span>}
              </div>
            </>
          )}

          {!isSignup && (
            <div className="form-options">
              <a
                href="#"
                className="forgot-password"
                onClick={(e) => {
                  e.preventDefault()
                  navigate('/reset-password')
                }}
              >
                Forgot Password?
              </a>
            </div>
          )}

          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="button-loader">
                <div className="spinner"></div>
                <span>{isSignup ? 'Creating Account...' : 'Signing In...'}</span>
              </div>
            ) : (
              isSignup ? 'Sign Up' : 'Sign In'
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>
            {isSignup ? "Already have an account? " : "Don't have an account? "}
            <a 
              href="#" 
              className="signup-link"
              onClick={(e) => {
                e.preventDefault()
                setIsSignup(!isSignup)
                setFormData({ username: '', email: '', password: '', confirmPassword: '', firstName: '', middleName: '', lastName: '', mobileNumber: '', gender: '', address: '', city: '' })
                setErrors({})
              }}
            >
              {isSignup ? 'Sign in' : 'Sign up'}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login