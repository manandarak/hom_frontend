import axios from 'axios';

// 1. Dynamic Base URL for CI/CD Deployment (AWS / Docker)
// Falls back to localhost ONLY if the environment variable is missing during local dev.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1',
});

// 2. Request Interceptor: Injects the Auth Token into every outgoing request
api.interceptors.request.use(
  (config) => {
    // Check both potential storage keys for flexibility
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 3. Response Interceptor: Global Error Handling & Security Gateway
api.interceptors.response.use(
  (response) => {
    // Pass through successful responses smoothly
    return response;
  },
  (error) => {
    // Intercept failed responses before they hit the React components
    if (error.response) {
      // 401 Unauthorized: The JWT is missing, expired, or invalid.
      if (error.response.status === 401) {
        console.warn('🔒 Security Alert: Session expired or invalid token. Purging session...');

        // Nuke the compromised/expired data
        localStorage.removeItem('token');
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');

        // Force a hard redirect to the login screen to protect the route
        // We check the pathname to avoid an infinite redirect loop if login itself throws a 401
        if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
      }
    }

    // Reject the promise so individual components can still catch specific errors if needed
    return Promise.reject(error);
  }
);

export default api;
