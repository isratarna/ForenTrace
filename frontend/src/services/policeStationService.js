import axios from 'axios';

// API base URL onujayi check kore niben (jemon http://localhost:5000/api)
const API_URL = 'http://localhost:5000/api/police-stations';

// Get token from localStorage (Admin protection-er jonno)
const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        headers: {
            Authorization: token ? `Bearer ${token}` : ''
        }
    };
};

export const policeStationService = {
    getStations: async () => {
        const response = await axios.get(API_URL);
        return response.data;
    },

    getStationById: async (id) => {
        const response = await axios.get(`${API_URL}/${id}`);
        return response.data;
    },

    createStation: async (stationData) => {
        const response = await axios.post(API_URL, stationData, getAuthHeaders());
        return response.data;
    },

    updateStation: async (id, stationData) => {
        const response = await axios.put(`${API_URL}/${id}`, stationData, getAuthHeaders());
        return response.data;
    },

    deleteStation: async (id) => {
        const response = await axios.delete(`${API_URL}/${id}`, getAuthHeaders());
        return response.data;
    }
};

export default policeStationService;