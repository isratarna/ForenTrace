import api from './api'; // Jodi apnar axios file-er naam apiClient.js ba onno kichu hoy, tahole path-ti adjust korun

export const getFamilyMembers = async (params = {}) => {
  const response = await api.get('/family-members', { params });
  return response.data;
};

export const getFamilyMembersByPerson = async (personId) => {
  const response = await api.get(`/family-members/person/${personId}`);
  return response.data;
};

export const getFamilyMemberById = async (id) => {
  const response = await api.get(`/family-members/${id}`);
  return response.data;
};

export const createFamilyMember = async (data) => {
  const response = await api.post('/family-members', data);
  return response.data;
};

export const updateFamilyMember = async (id, data) => {
  const response = await api.put(`/family-members/${id}`, data);
  return response.data;
};

export const deleteFamilyMember = async (id) => {
  const response = await api.delete(`/family-members/${id}`);
  return response.data;
};

export const registerFamilyDnaSample = async (id, sampleData) => {
  const response = await api.post(`/family-members/${id}/register-dna`, sampleData);
  return response.data;
};