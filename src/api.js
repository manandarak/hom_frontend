import axios from 'axios';

// Update this if your FastAPI server runs on a different port
const API_URL = 'http://127.0.0.1:8000/api/v1';

const api = axios.create({
  baseURL: API_URL,
});

// Automatically attach JWT token to every request if it exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hom_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;