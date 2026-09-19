import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoClose } from 'react-icons/io5';
import axios from 'axios';

const LoginModal = () => {
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const refreshInProgressRef = useRef(false);

  const clearAuthAndShowModal = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('authUser');
    localStorage.removeItem('user_type');
    localStorage.removeItem('authTokens');
    window.dispatchEvent(new Event('auth-changed'));
    setShowModal(true);
  };

  const isTokenExpiringSoon = (token, bufferSeconds = 120) => {
    try {
      const base64Url = token.split('.')[1] || '';
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      const exp = payload?.exp;
      if (!exp) return true;
      const now = Math.floor(Date.now() / 1000);
      return exp - now <= bufferSeconds;
    } catch {
      return true;
    }
  };

  const refreshSessionToken = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken || refreshInProgressRef.current) return;

    refreshInProgressRef.current = true;
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/token/refresh/`,
        { refresh: refreshToken }
      );

      const newAccess = response.data?.access || response.data?.access_token;
      const newRefresh = response.data?.refresh;
      if (!newAccess) throw new Error('Missing access token in refresh response');

      localStorage.setItem('access_token', newAccess);
      if (newRefresh) {
        localStorage.setItem('refresh_token', newRefresh);
      }

      const authTokens = localStorage.getItem('authTokens');
      if (authTokens) {
        try {
          const parsed = JSON.parse(authTokens);
          parsed.access_token = newAccess;
          if (newRefresh) parsed.refresh_token = newRefresh;
          localStorage.setItem('authTokens', JSON.stringify(parsed));
        } catch {
          // ignore parse issues
        }
      }
    } catch (error) {
      clearAuthAndShowModal();
    } finally {
      refreshInProgressRef.current = false;
    }
  };

  useEffect(() => {
    const handleShowModal = () => {
      setShowModal(true);
    };

    // Listen for the custom event
    window.addEventListener('show-login-modal', handleShowModal);

    return () => {
      window.removeEventListener('show-login-modal', handleShowModal);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const accessToken = localStorage.getItem('access_token');
      const refreshToken = localStorage.getItem('refresh_token');
      if (!accessToken || !refreshToken) return;

      if (isTokenExpiringSoon(accessToken, 120)) {
        refreshSessionToken();
      }
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleLogin = () => {
    setShowModal(false);
    navigate('/login');
  };

  const handleClose = () => {
    setShowModal(false);
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-9999">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-900">Session Expired</h3>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <IoClose className="w-6 h-6" />
          </button>
        </div>
        <div className="mb-6">
          <p className="text-gray-700 mb-2">
            Your session has expired. Please log in again to continue.
          </p>
          <p className="text-sm text-gray-500">
            You will be redirected to the login page.
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLogin}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;

