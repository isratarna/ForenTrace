import React, { useEffect, useState } from 'react';
import policeStationService from '../services/policeStationService';

export default function PoliceStations() {
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Form state for Add/Edit
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState(null);
    const [formData, setFormData] = useState({
        station_name: '',
        district: '',
        city: '',
        address: '',
        contact_number: '',
        email: ''
    });

    // Delete confirmation state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteId, setDeleteId] = useState(null);

    // Fetch stations on load
    useEffect(() => {
        fetchStations();
    }, []);

    const fetchStations = async () => {
        try {
            setLoading(true);
            const response = await policeStationService.getStations();
            if (response.success) {
                setStations(response.data);
            }
            setLoading(false);
        } catch (err) {
            console.error(err);
            setError('Failed to load police stations');
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleOpenAddModal = () => {
        setIsEditing(false);
        setFormData({ station_name: '', district: '', city: '', address: '', contact_number: '', email: '' });
        setShowModal(true);
    };

    const handleOpenEditModal = (station) => {
        setIsEditing(true);
        setCurrentId(station.station_id || station.id);
        setFormData({
            station_name: station.station_name || '',
            district: station.district || '',
            city: station.city || '',
            address: station.address || '',
            contact_number: station.contact_number || '',
            email: station.email || ''
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isEditing) {
                await policeStationService.updateStation(currentId, formData);
            } else {
                await policeStationService.createStation(formData);
            }
            setShowModal(false);
            fetchStations();
        } catch (err) {
            console.error(err);
            alert('Operation failed. Make sure you are logged in as Admin.');
        }
    };

    const confirmDelete = (id) => {
        setDeleteId(id);
        setShowDeleteModal(true);
    };

    const handleDelete = async () => {
        try {
            await policeStationService.deleteStation(deleteId);
            setShowDeleteModal(false);
            setDeleteId(null);
            fetchStations();
        } catch (err) {
            console.error(err);
            alert('Delete failed. Station might be referenced or unauthorized.');
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Police Stations Management</h1>
                    <p className="text-sm text-gray-500">Manage all registered police stations in the system.</p>
                </div>
                <button
                    onClick={handleOpenAddModal}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                    + Add New Station
                </button>
            </div>

            {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}

            {loading ? (
                <p className="text-gray-500">Loading stations...</p>
            ) : (
                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Station Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">District</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {stations.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-4 text-center text-gray-500">No police stations found.</td>
                                </tr>
                            ) : (
                                stations.map((station) => (
                                    <tr key={station.station_id || station.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{station.station_name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{station.district}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{station.city}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{station.contact_number}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => handleOpenEditModal(station)}
                                                className="text-indigo-600 hover:text-indigo-900 mr-4"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => confirmDelete(station.station_id || station.id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add / Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">{isEditing ? 'Edit Police Station' : 'Add Police Station'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">Station Name</label>
                                <input type="text" name="station_name" value={formData.station_name} onChange={handleInputChange} required className="mt-1 block w-full border border-gray-300 rounded-md p-2" />
                            </div>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">District</label>
                                <input type="text" name="district" value={formData.district} onChange={handleInputChange} required className="mt-1 block w-full border border-gray-300 rounded-md p-2" />
                            </div>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">City</label>
                                <input type="text" name="city" value={formData.city} onChange={handleInputChange} required className="mt-1 block w-full border border-gray-300 rounded-md p-2" />
                            </div>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">Address</label>
                                <input type="text" name="address" value={formData.address} onChange={handleInputChange} required className="mt-1 block w-full border border-gray-300 rounded-md p-2" />
                            </div>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">Contact Number</label>
                                <input type="text" name="contact_number" value={formData.contact_number} onChange={handleInputChange} required className="mt-1 block w-full border border-gray-300 rounded-md p-2" />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700">Email</label>
                                <input type="email" name="email" value={formData.email} onChange={handleInputChange} required className="mt-1 block w-full border border-gray-300 rounded-md p-2" />
                            </div>
                            <div className="flex justify-end space-x-3">
                                <button type="button" onClick={() => setShowModal(false)} className="bg-gray-300 px-4 py-2 rounded-md">Cancel</button>
                                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">{isEditing ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-sm">
                        <h2 className="text-lg font-bold mb-2">Confirm Delete</h2>
                        <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this police station?</p>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setShowDeleteModal(false)} className="bg-gray-300 px-4 py-2 rounded-md">Cancel</button>
                            <button onClick={handleDelete} className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}