import axios from 'axios';

// Create an axios instance with default configuration
console.log('Current Environment:', import.meta.env.MODE); // 'development' or 'production'
console.log('Environment API URL:', import.meta.env.VITE_API_URL);
console.log('Using fallback?', !import.meta.env.VITE_API_URL);
console.log('Is Production?', import.meta.env.PROD);
console.log('Is Development?', import.meta.env.DEV);

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000', // Use environment variable with fallback
    headers: {
        'Content-Type': 'application/json',
    },
    // Remove withCredentials since we don't need it for this simple test
    withCredentials: false
});

// Log the final baseURL being used
console.log('Final API URL:', api.defaults.baseURL);

// Add response interceptor for error handling
api.interceptors.response.use(
    (response) => {
        console.log('API Response interceptor:', response.data);
        return response;
    },
    (error) => {
        console.error('API Error:', error);
        return Promise.reject(error);
    }
);

// API Service class
class ApiService {
    async checkHealth() {
        try {
            const response = await api.get('/api/health');
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Health check error:', error);
            return {
                success: false,
                error: 'Backend not available'
            };
        }
    }

    async sendMessage(message: string, userId: string = 'test_user') {
        try {
            const response = await api.post('/api/ask_single', {
                user_id: userId,
                question: message
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Send message error:', error);
            return {
                success: false,
                error: error.response?.data?.detail || 'Failed to send message'
            };
        }
    }

    async getStatus(questionId: string) {
        try {
            const response = await api.get(`/api/status/${questionId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Get status error:', error);
            return {
                success: false,
                error: error.response?.data?.detail || 'Failed to get status'
            };
        }
    }
}

// Export singleton instance
export const apiService = new ApiService();

export default api; 