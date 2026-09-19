import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiCamera, FiUser, FiMail, FiPhone, FiMapPin, FiSave, FiEye, FiEyeOff } from 'react-icons/fi'
import axios from 'axios'

const CustomizeProfile = () => {
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState('https://ui-avatars.com/api/?name=Vaishnavi Medicare+User&background=14b8a6&color=fff')
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [changePasswordStatus, setChangePasswordStatus] = useState({ type: '', message: '' })
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    instagram: '',
    twitter: '',
    linkedin: '',
  })
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPasswords, setShowPasswords] = useState({
    oldPassword: false,
    newPassword: false,
    confirmPassword: false,
  })

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const access = localStorage.getItem('access_token')
        if (!access) return

        const response = await axios.get(`${import.meta.env.VITE_BASEURL_CARE}/accounts/profile/`, {
          headers: { Authorization: `Bearer ${access}` },
        })

        const user = response.data?.user || response.data || {}
        const fullName = [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ')

        setForm({
          fullName: fullName || '',
          email: user.email || '',
          phone: user.mobile_number || '',
          address: user.address || '',
          instagram: response.data?.instagram || '',
          twitter: response.data?.twitter || '',
          linkedin: response.data?.linkedin || '',
        })

        const avatarCandidate =
          response.data?.profile_pic ||
          user.profile_pic ||
          response.data?.avatar ||
          user.avatar ||
          response.data?.profile_picture ||
          user.profile_picture
        if (avatarCandidate) setAvatarUrl(avatarCandidate)
      } catch (error) {
        console.error('Error loading profile:', error)
      }
    }
    fetchProfile()
  }, [])

  const parseNameParts = (fullName = '') => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return { firstName: '', middleName: '', lastName: '' }
    if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' }
    if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] }
    return {
      firstName: parts[0],
      middleName: parts.slice(1, -1).join(' '),
      lastName: parts[parts.length - 1],
    }
  }

  const handleSave = async () => {
    const access = localStorage.getItem('access_token')
    if (!access) {
      setStatus({ type: 'error', message: 'Please log in to update your profile.' })
      return
    }

    const { firstName, middleName, lastName } = parseNameParts(form.fullName)

    const payload = {
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      email: form.email,
      mobile_number: form.phone,
      address: form.address,
      instagram: form.instagram,
      twitter: form.twitter,
      linkedin: form.linkedin,
    }

    if (avatarUrl && !avatarUrl.startsWith('https://ui-avatars.com') && !avatarUrl.startsWith('blob:')) {
      payload.avatar = avatarUrl
    }

    try {
      setIsSaving(true)
      setStatus({ type: '', message: '' })
      const requestBody = selectedAvatarFile
        ? (() => {
            const formData = new FormData()
            formData.append('first_name', payload.first_name || '')
            formData.append('middle_name', payload.middle_name || '')
            formData.append('last_name', payload.last_name || '')
            formData.append('email', payload.email || '')
            formData.append('mobile_number', payload.mobile_number || '')
            formData.append('address', payload.address || '')
            formData.append('instagram', payload.instagram || '')
            formData.append('twitter', payload.twitter || '')
            formData.append('linkedin', payload.linkedin || '')
            formData.append('profile_pic', selectedAvatarFile)
            return formData
          })()
        : payload

      const response = await axios.put(`${import.meta.env.VITE_BASEURL_CARE}/accounts/profile/`, requestBody, {
        headers: { Authorization: `Bearer ${access}` },
      })
      
      // Update authUser in localStorage with the updated profile data
      const updatedUser = response.data?.user || response.data || {}
      const currentAuthUser = JSON.parse(localStorage.getItem('authUser') || '{}')
      
      // Merge updated fields with existing authUser data
      const updatedAuthUser = {
        ...currentAuthUser,
        first_name: updatedUser.first_name || currentAuthUser.first_name,
        middle_name: updatedUser.middle_name || currentAuthUser.middle_name,
        last_name: updatedUser.last_name || currentAuthUser.last_name,
        email: updatedUser.email || currentAuthUser.email,
        mobile_number: updatedUser.mobile_number || currentAuthUser.mobile_number,
        address: updatedUser.address || currentAuthUser.address,
        profile_pic: updatedUser.profile_pic || response.data?.profile_pic || currentAuthUser.profile_pic,
        avatar: updatedUser.avatar || response.data?.avatar || currentAuthUser.avatar,
        profile_picture: updatedUser.profile_picture || response.data?.profile_picture || currentAuthUser.profile_picture,
      }
      
      localStorage.setItem('authUser', JSON.stringify(updatedAuthUser))
      
      // Dispatch event to notify NavBar and other components
      window.dispatchEvent(new Event('auth-changed'))
      setSelectedAvatarFile(null)
      
      setStatus({ type: 'success', message: 'Profile updated successfully.' })
    } catch (error) {
      console.error('Error saving profile:', error)
      const message =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        'Unable to save your profile. Please try again.'
      setStatus({ type: 'error', message })
    } finally {
      setIsSaving(false)
    }
  }

  const updatePasswordField = (key, value) =>
    setPasswordForm((prev) => ({ ...prev, [key]: value }))

  const handleChangePassword = async () => {
    const access = localStorage.getItem('access_token')
    if (!access) {
      setChangePasswordStatus({ type: 'error', message: 'Please log in to change your password.' })
      return
    }

    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setChangePasswordStatus({ type: 'error', message: 'Please fill all password fields.' })
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setChangePasswordStatus({ type: 'error', message: 'New password and confirm password do not match.' })
      return
    }

    try {
      setIsChangingPassword(true)
      setChangePasswordStatus({ type: '', message: '' })

      await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/change-password/`,
        {
          old_password: passwordForm.oldPassword,
          new_password: passwordForm.newPassword,
          new_password_confirm: passwordForm.confirmPassword,
        },
        { headers: { Authorization: `Bearer ${access}` } }
      )

      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
      setChangePasswordStatus({ type: 'success', message: 'Password changed successfully. Logging out...' })

      // Force fresh login after password update.
      localStorage.removeItem('authUser')
      localStorage.removeItem('authTokens')
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_type')
      window.dispatchEvent(new Event('auth-changed'))

      window.alert('Password changed successfully. Please login with your new credentials.')
      navigate('/login', { replace: true })
    } catch (error) {
      console.error('Error changing password:', error)
      const apiData = error.response?.data
      const message =
        apiData?.message ||
        apiData?.detail ||
        (Array.isArray(apiData?.new_password) ? apiData.new_password[0] : '') ||
        'Unable to change password. Please try again.'
      setChangePasswordStatus({ type: 'error', message })
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Customize Profile</h1>
          <p className="text-slate-500 mt-1">Update your personal information and profile picture</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="sm:w-1/3">
              <div className="relative w-36 h-36 rounded-full overflow-hidden mx-auto sm:mx-0 shadow-inner border border-slate-100">
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                <label className="absolute bottom-2 right-2 bg-teal-600 text-white rounded-full p-2 cursor-pointer shadow-lg">
                  <FiCamera />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setSelectedAvatarFile(file)
                        setAvatarUrl(URL.createObjectURL(file))
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Full Name</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 bg-white">
                  <FiUser className="text-slate-400" />
                  <input
                    value={form.fullName}
                    onChange={(e) => update('fullName', e.target.value)}
                    placeholder="Your name"
                    className="w-full p-2 outline-none text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 bg-white">
                  <FiMail className="text-slate-400" />
                  <input
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                    placeholder="Email address"
                    className="w-full p-2 outline-none text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Phone</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 bg-white">
                  <FiPhone className="text-slate-400" />
                  <input
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                    placeholder="Phone number"
                    className="w-full p-2 outline-none text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Address</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 bg-white">
                  <FiMapPin className="text-slate-400" />
                  <input
                    value={form.address}
                    onChange={(e) => update('address', e.target.value)}
                    placeholder="Address"
                    className="w-full p-2 outline-none text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Instagram</label>
                <input
                  value={form.instagram}
                  onChange={(e) => update('instagram', e.target.value)}
                  placeholder="@yourhandle"
                  className="w-full p-2 border border-slate-200 rounded-xl outline-none text-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Twitter</label>
                <input
                  value={form.twitter}
                  onChange={(e) => update('twitter', e.target.value)}
                  placeholder="@yourhandle"
                  className="w-full p-2 border border-slate-200 rounded-xl outline-none text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-600 mb-1">LinkedIn</label>
                <input
                  value={form.linkedin}
                  onChange={(e) => update('linkedin', e.target.value)}
                  placeholder="Profile URL"
                  className="w-full p-2 border border-slate-200 rounded-xl outline-none text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {status.message && (
              <div
                className={`flex-1 rounded-2xl px-4 py-3 text-sm ${
                  status.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                }`}
              >
                {status.message}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-3 rounded-full bg-teal-600 text-white font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 justify-center"
            >
              <FiSave className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
            <p className="text-sm text-slate-500 mt-1">Use your current password and set a new one.</p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Old Password</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 bg-white">
                  <input
                    type={showPasswords.oldPassword ? 'text' : 'password'}
                    value={passwordForm.oldPassword}
                    onChange={(e) => updatePasswordField('oldPassword', e.target.value)}
                    placeholder="Enter old password"
                    className="w-full p-2 outline-none text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords((prev) => ({ ...prev, oldPassword: !prev.oldPassword }))
                    }
                    className="text-slate-500 hover:text-slate-700"
                    aria-label={showPasswords.oldPassword ? 'Hide old password' : 'Show old password'}
                  >
                    {showPasswords.oldPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">New Password</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 bg-white">
                  <input
                    type={showPasswords.newPassword ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => updatePasswordField('newPassword', e.target.value)}
                    placeholder="Enter new password"
                    className="w-full p-2 outline-none text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords((prev) => ({ ...prev, newPassword: !prev.newPassword }))
                    }
                    className="text-slate-500 hover:text-slate-700"
                    aria-label={showPasswords.newPassword ? 'Hide new password' : 'Show new password'}
                  >
                    {showPasswords.newPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Confirm Password</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 bg-white">
                  <input
                    type={showPasswords.confirmPassword ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => updatePasswordField('confirmPassword', e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full p-2 outline-none text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords((prev) => ({
                        ...prev,
                        confirmPassword: !prev.confirmPassword,
                      }))
                    }
                    className="text-slate-500 hover:text-slate-700"
                    aria-label={showPasswords.confirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showPasswords.confirmPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {changePasswordStatus.message && (
                <div
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm ${
                    changePasswordStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {changePasswordStatus.message}
                </div>
              )}
              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
                className="px-5 py-3 rounded-full bg-teal-600 text-white font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 justify-center"
              >
                {isChangingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CustomizeProfile

