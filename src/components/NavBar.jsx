import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FiMail, FiPhone } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import { useFaqContacts } from '../hooks/useFaqContacts'
import { hasOwnerPrivileges, isMasterAdmin } from '../utils/authRoles'

const links = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '/about' },
  { label: 'Media', to: '/media' },
]

const contactIconButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'

const NavBar = () => {
  const navigate = useNavigate()
  const { contacts } = useFaqContacts()
  const [open, setOpen] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showAuthDropdown, setShowAuthDropdown] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const dropdownRef = useRef(null)

  const phoneTel = contacts.phoneTel
  const phoneDisplay = contacts.phoneDisplay
  const whatsappUrl = contacts.whatsappUrl
  const email = contacts.email

  const contactIcons = (
    <>
      {phoneTel ? (
        <a
          href={phoneTel}
          className={`${contactIconButtonClass} text-teal-600 hover:border-teal-500 focus-visible:ring-teal-500`}
          title={`Call ${phoneDisplay}`}
          aria-label={`Call ${phoneDisplay}`}
          onClick={() => setOpen(false)}
        >
          <FiPhone className="h-[18px] w-[18px]" aria-hidden="true" />
        </a>
      ) : null}
      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${contactIconButtonClass} text-[#25D366] hover:border-[#25D366] focus-visible:ring-[#25D366]`}
          title={`WhatsApp ${phoneDisplay}`}
          aria-label={`Open WhatsApp chat with ${phoneDisplay}`}
          onClick={() => setOpen(false)}
        >
          <FaWhatsapp className="h-[18px] w-[18px]" aria-hidden="true" />
        </a>
      ) : null}
      {email ? (
        <a
          href={`mailto:${email}`}
          className={`${contactIconButtonClass} text-slate-800 hover:border-red-500 hover:text-red-600 focus-visible:ring-red-500`}
          title={`Email ${email}`}
          aria-label={`Email ${email}`}
          onClick={() => setOpen(false)}
        >
          <FiMail className="h-[18px] w-[18px]" aria-hidden="true" />
        </a>
      ) : null}
    </>
  )

  useEffect(() => {
    const syncAuth = () => {
      const stored = localStorage.getItem('authUser')
      setAuthUser(stored ? JSON.parse(stored) : null)
      setAvatarError(false) // Reset avatar error when user changes
    }
    syncAuth()
    window.addEventListener('storage', syncAuth)
    window.addEventListener('auth-changed', syncAuth)
    return () => {
      window.removeEventListener('storage', syncAuth)
      window.removeEventListener('auth-changed', syncAuth)
    }
  }, [])

  useEffect(() => {
    const handleNewNotification = (event) => {
      const incoming = Number(event?.detail?.count)
      const incrementBy = Number.isFinite(incoming) && incoming > 0 ? incoming : 1
      setUnreadNotificationCount((prev) => prev + incrementBy)
    }
    window.addEventListener('notifications:new', handleNewNotification)
    return () => window.removeEventListener('notifications:new', handleNewNotification)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false)
        setShowAuthDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const clearAuth = () => {
    localStorage.removeItem('authUser')
    localStorage.removeItem('authTokens')
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_type')
    window.dispatchEvent(new Event('auth-changed'))
    setAuthUser(null)
    setUnreadNotificationCount(0)
  }

  const handleLogout = async () => {
    const refresh = localStorage.getItem('refresh_token')
    const access = localStorage.getItem('access_token')

    if (refresh && access) {
      try {
        await axios.post(
          `${import.meta.env.VITE_BASEURL_CARE}/accounts/logout/`,
          { refresh_token: refresh },
          {
            headers: {
              Authorization: `Bearer ${access}`,
              'Content-Type': 'application/json',
            },
          }
        )
      } catch (error) {
        const errorData = error?.response?.data
        
        // Handle blacklisted token or any other error
        if (errorData?.code === 'token_not_valid' || errorData?.detail === 'Token is blacklisted') {
          
        } else {
          console.error('Logout failed:', errorData || error.message)
        }
        
        // Always proceed with clearing local auth, regardless of API error
      }
    }

    // Always clear auth and navigate, even if API call fails
    clearAuth()
    navigate('/')
  }

  // Check if user is authenticated
  const isAuthenticated = () => {
    const accessToken = localStorage.getItem('access_token')
    const authUser = localStorage.getItem('authUser')
    return !!(accessToken || authUser)
  }

  // Check if user is a Customer
  const isCustomer = () => {
    if (!authUser) return false
    const userType = authUser.user_type || ''
    return userType.toLowerCase() === 'customer'
  }

  // Check if user has owner / master-admin privileges
  const isVsreOwner = () => hasOwnerPrivileges(authUser)
  const showCreatePersona = isMasterAdmin(authUser)
  const showPersonaPermissions = showCreatePersona

  // Handle Care link click with authentication check
  const handleCareClick = (e, to) => {
    if (to === '/senior-care' && !isAuthenticated()) {
      e.preventDefault()
      navigate('/login')
      setOpen(false)
    }
  }

  const userAvatar = authUser?.profile_pic || authUser?.profile_picture || authUser?.avatar || ''
  const handleNotificationsClick = () => {
    setShowUserDropdown(false)
    setShowAuthDropdown(false)
    setOpen(false)
    setUnreadNotificationCount(0)
    navigate('/dashboard?section=notifications')
  }

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center shrink-0" aria-label="Vaishnavi Medicare home">
            <img
              className="h-12 w-12 object-contain"
              src="/logoVaishnavi.png"
              alt="Vaishnavi Medicare"
            />
          </Link>
          <Link
            to="/"
            className="text-3xl mr-5 font-semibold tracking-tight text-transparent bg-clip-text bg-linear-to-r from-slate-900 via-emerald-500 to-teal-600 font-['Cormorant_Garamond']"
          >
            Vaishnavi Medicare
          </Link>

          <div className="hidden md:flex items-center gap-4 ml-auto">
            <nav className="flex items-center gap-6">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? "text-teal-600"
                        : "text-gray-600 hover:text-teal-500"
                    }`
                  }
                  onClick={(e) => {
                    handleCareClick(e, link.to);
                    setOpen(false);
                  }}
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-1 border-l border-slate-200 pl-4">
              {contactIcons}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3 ml-4">
            {!authUser ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowAuthDropdown((prev) => !prev)}
                  className="px-4 py-2 text-sm font-semibold rounded-full border border-teal-600 text-teal-600 hover:bg-teal-50 transition-colors inline-flex items-center gap-2"
                  aria-expanded={showAuthDropdown}
                  aria-haspopup="menu"
                >
                  Login / Signup
                  <svg
                    className={`w-4 h-4 transition-transform ${showAuthDropdown ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {showAuthDropdown && (
                  <div className="absolute top-full mt-2 right-0 w-40 rounded-xl border border-slate-100 bg-white shadow-lg shadow-slate-200/70 py-1 z-20">
                    <Link
                      to="/login"
                      state={{ authMode: "login" }}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => setShowAuthDropdown(false)}
                    >
                      Login
                    </Link>
                    <Link
                      to="/login"
                      state={{ authMode: "signup" }}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => setShowAuthDropdown(false)}
                    >
                      Signup
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3" ref={dropdownRef}>
                {userAvatar && !avatarError ? (
                  <img
                    src={userAvatar}
                    alt={`${authUser.first_name} ${authUser.last_name}`}
                    className="h-10 w-10 rounded-full object-cover border-2 border-teal-200"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-semibold">
                    {authUser.first_name?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
                <div className="text-sm">
                  <p className="font-semibold text-slate-900 leading-none">
                    {authUser.first_name} {authUser.last_name}
                  </p>
                  {/* <p className="text-slate-500 text-xs capitalize">{authUser.user_type || 'Customer'}</p> */}
                </div>
                <button
                  onClick={() => setShowUserDropdown((prev) => !prev)}
                  className="px-3 py-2 text-sm font-medium rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1"
                >
                  Menu
                  <svg
                    className={`w-4 h-4 transition-transform ${showUserDropdown ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {/* <button
                  type="button"
                  onClick={handleNotificationsClick}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-teal-600 transition-colors"
                  title="Notifications"
                  aria-label="Open notifications"
                >
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 inline-flex min-w-[1.15rem] h-[1.15rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  )}
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9 17a3 3 0 0 0 6 0" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button> */}
                {showUserDropdown && (
                  <div className="absolute top-full mt-3 right-4 w-56 rounded-2xl border border-slate-100 bg-white shadow-lg shadow-slate-200/70">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-900">
                        {authUser.first_name} {authUser.last_name}
                      </p>
                      {/* <p className="text-xs text-slate-500 capitalize">{authUser.user_type || 'Customer'}</p> */}
                    </div>
                    <div className="py-2 text-sm text-slate-600">
                      <Link
                        to="/dashboard"
                        className="block px-4 py-2 hover:bg-slate-50"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        Dashboard
                      </Link>
                      {showCreatePersona ? (
                        <Link
                          to="/create-persona"
                          className="block px-4 py-2 hover:bg-slate-50"
                          onClick={() => setShowUserDropdown(false)}
                        >
                          Create Persona
                        </Link>
                      ) : null}
                      {showPersonaPermissions ? (
                        <Link
                          to="/persona-permissions"
                          className="block px-4 py-2 hover:bg-slate-50"
                          onClick={() => setShowUserDropdown(false)}
                        >
                          Permissions
                        </Link>
                      ) : null}
                      <Link
                        to="/settings"
                        className="block px-4 py-2 hover:bg-slate-50"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        Settings
                      </Link>
                      <Link
                        to="/customize-profile"
                        className="block px-4 py-2 hover:bg-slate-50"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        Customize Profile
                      </Link>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          handleLogout();
                        }}
                        className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100"
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              {open ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-4 py-3 flex flex-col gap-3">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className="text-sm font-medium text-gray-700"
                onClick={(e) => {
                  handleCareClick(e, link.to);
                  setOpen(false);
                }}
              >
                {link.label}
              </NavLink>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {contactIcons}
            </div>
            {!authUser ? (
              <Link
                to="/login"
                className="px-4 py-2 text-center text-sm font-semibold rounded-full border border-teal-600 text-teal-600 hover:bg-teal-50 transition-colors"
                onClick={() => setOpen(false)}
              >
                Login / Signup
              </Link>
            ) : (
              <div className="border border-slate-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {userAvatar && !avatarError ? (
                    <img
                      src={userAvatar}
                      alt={`${authUser.first_name} ${authUser.last_name}`}
                      className="h-10 w-10 rounded-full object-cover border-2 border-teal-200"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-semibold">
                      {authUser.first_name?.[0]?.toUpperCase() || "U"}
                    </div>
                  )}
                  <div className="text-sm">
                    <p className="font-semibold text-slate-900 leading-none">
                      {authUser.first_name} {authUser.last_name}
                    </p>
                    {/* <p className="text-slate-500 text-xs capitalize">{authUser.user_type || 'Customer'}</p> */}
                  </div>
                </div>
                <div className="flex flex-col text-sm text-slate-600">
                  <Link
                    to="/dashboard"
                    className="py-2 hover:text-teal-600"
                    onClick={() => setOpen(false)}
                  >
                    Dashboard
                  </Link>
                  {showCreatePersona ? (
                    <Link
                      to="/create-persona"
                      className="py-2 hover:text-teal-600"
                      onClick={() => setOpen(false)}
                    >
                      Create Persona
                    </Link>
                  ) : null}
                  {showPersonaPermissions ? (
                    <Link
                      to="/persona-permissions"
                      className="py-2 hover:text-teal-600"
                      onClick={() => setOpen(false)}
                    >
                      Permissions
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="py-2 text-left hover:text-teal-600"
                    onClick={handleNotificationsClick}
                  >
                    Notifications
                    {unreadNotificationCount > 0
                      ? ` (${unreadNotificationCount > 99 ? "99+" : unreadNotificationCount})`
                      : ""}
                  </button>

                  <Link
                    to="/settings"
                    className="py-2 hover:text-teal-600"
                    onClick={() => setOpen(false)}
                  >
                    Settings
                  </Link>
                  <Link
                    to="/customize-profile"
                    className="py-2 hover:text-teal-600"
                    onClick={() => setOpen(false)}
                  >
                    Customize Profile
                  </Link>
                </div>
                <button
                  onClick={() => {
                    handleLogout();
                    setOpen(false);
                  }}
                  className="w-full px-4 py-2 text-sm font-semibold rounded-full border border-slate-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default NavBar

