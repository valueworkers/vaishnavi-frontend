import axios from 'axios';

// Create a custom event to trigger the login modal
export const showLoginModal = () => {
  window.dispatchEvent(new CustomEvent('show-login-modal'));
};

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

// Function to refresh the access token
const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const response = await axios.post(
      `${import.meta.env.VITE_BASEURL_CARE}/accounts/token/refresh/`,
      {
        refresh: refreshToken
      }
    );

    const newAccessToken = response.data?.access || response.data?.access_token;
    const newRefreshToken = response.data?.refresh;
    
    if (newAccessToken) {
      // Update stored tokens
      localStorage.setItem('access_token', newAccessToken);
      if (newRefreshToken) {
        localStorage.setItem('refresh_token', newRefreshToken);
      }
      
      // Update authTokens if it exists
      const authTokens = localStorage.getItem('authTokens');
      if (authTokens) {
        try {
          const tokens = JSON.parse(authTokens);
          tokens.access_token = newAccessToken;
          if (newRefreshToken) {
            tokens.refresh_token = newRefreshToken;
          }
          localStorage.setItem('authTokens', JSON.stringify(tokens));
        } catch (e) {
          // Ignore parsing errors
        }
      }
      
      return newAccessToken;
    } else {
      throw new Error('No access token in refresh response');
    }
  } catch (error) {
    // Check if token is blacklisted or invalid
    const errorData = error.response?.data;
    const isBlacklisted = errorData?.code === 'token_not_valid' || 
                          errorData?.detail === 'Token is blacklisted' ||
                          errorData?.detail?.includes('blacklist');
    
    if (isBlacklisted) {
     
    } else {
      console.error('Token refresh failed:', error);
    }
    
    // Clear all auth data
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('authUser');
    localStorage.removeItem('user_type');
    localStorage.removeItem('authTokens');
    
    // Dispatch auth-changed event to update UI
    window.dispatchEvent(new Event('auth-changed'));
    
    // Show login modal
    showLoginModal();
    
    throw error;
  }
};

// Request interceptor to add access token to requests
axios.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('access_token');
    
    if (accessToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
axios.interceptors.response.use(
  (response) => {
    // Return successful responses as-is
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const errorData = error.response?.data;
    const isRefreshRequest = (originalRequest?.url || '').includes('/accounts/token/refresh/');

    if (isRefreshRequest) {
      return Promise.reject(error);
    }
    
    // Check if token is blacklisted (specific check before general 401 handling)
    const isBlacklisted = errorData?.code === 'token_not_valid' || 
                          errorData?.detail === 'Token is blacklisted' ||
                          errorData?.detail?.includes('blacklist');
    
    if (isBlacklisted) {
      
      
      // Clear all auth data
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('authUser');
      localStorage.removeItem('user_type');
      localStorage.removeItem('authTokens');
      
      // Dispatch auth-changed event to update UI
      window.dispatchEvent(new Event('auth-changed'));
      
      // Show login modal
      showLoginModal();
      
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized errors (token expired but not blacklisted)
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      // If we're already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axios(originalRequest);
          })
          .catch(err => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newAccessToken = await refreshAccessToken();
        
        // Process queued requests
        processQueue(null, newAccessToken);
        
        // Update the original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        
        // Retry the original request
        return axios(originalRequest);
      } catch (refreshError) {
        // Refresh failed, process queue with error
        processQueue(refreshError, null);
        
        // Reject the promise so the calling code knows the request failed
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    // For other errors, just reject normally
    return Promise.reject(error);
  }
);

export default axios;
