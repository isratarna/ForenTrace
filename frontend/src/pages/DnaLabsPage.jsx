import React, { useState, useEffect } from 'react';
import { PageHeader, SearchFilters } from '../components/Ui';

const API_BASE = 'http://localhost:8000/api/labs';

export default function DnaLabsPage() {
    const [labs, setLabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [cityFilter, setCityFilter] = useState('');

    const [formData, setFormData] = useState({
        lab_name: '',
        city: '',
        address: '',
        contact_number: '',
        email: '',
    });
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        fetchLabs();
    }, []);

    const fetchLabs = async () => {
        try {
            setLoading(true);
            const res = await fetch(API_BASE, {
                credentials: 'include',
            });
            const data = await res.json();
            if (data.success) {
                setLabs(data.data || []);
            } else {
                setError(data.message || 'Failed to fetch labs');
            }
        } catch (err) {
            setError('Error connecting to backend server');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData),
            });

            const data = await res.json();
            if (data.success) {
                setSuccess(editingId ? 'Lab updated successfully!' : 'Lab created successfully!');
                resetForm();
                fetchLabs();
            } else {
                setError(data.message || 'Action failed');
            }
        } catch (err) {
            setError('Request failed');
        }
    };

    const handleEdit = (lab) => {
        setEditingId(lab.lab_id);
        setFormData({
            lab_name: lab.lab_name,
            city: lab.city,
            address: lab.address,
            contact_number: lab.contact_number,
            email: lab.email,
        });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this DNA Lab?')) return;
        setError('');
        setSuccess('');

        try {
            const res = await fetch(`${API_BASE}/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = await res.json();
            if (data.success) {
                setSuccess('DNA Lab deleted successfully');
                fetchLabs();
            } else {
                setError(data.message || 'Failed to delete lab');
            }
        } catch (err) {
            setError('Deletion request failed');
        }
    };

    const resetForm = () => {
        setFormData({ lab_name: '', city: '', address: '', contact_number: '', email: '' });
        setEditingId(null);
        setShowForm(false);
    };

    const uniqueCities = Array.from(new Set(labs.map((lab) => lab.city))).filter(Boolean);

    const filteredLabs = labs.filter((lab) => {
        const matchesQuery =
            lab.lab_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lab.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lab.email?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCity = cityFilter ? lab.city === cityFilter : true;
        return matchesQuery && matchesCity;
    });

    return (
        <div className="container-fluid py-4">
            <PageHeader
                title="DNA Laboratories"
                subtitle="Manage and oversee registered forensic DNA testing facilities."
                action={
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            resetForm();
                            setShowForm(!showForm);
                        }}
                    >
                        {showForm ? 'Close Form' : '+ Add DNA Lab'}
                    </button>
                }
            />

            {error && <div className="alert alert-danger my-3 shadow-sm">{error}</div>}
            {success && <div className="alert alert-success my-3 shadow-sm">{success}</div>}

            {/* Collapsible / Toggleable Form */}
            {showForm && (
                <div className="card shadow-sm border-0 mb-4 bg-light">
                    <div className="card-body p-4">
                        <h5 className="card-title fw-bold mb-3">
                            {editingId ? 'Edit DNA Laboratory' : 'Register New DNA Laboratory'}
                        </h5>
                        <form onSubmit={handleSubmit}>
                            <div className="row g-3">
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">Lab Name</label>
                                    <input
                                        type="text"
                                        name="lab_name"
                                        className="form-control"
                                        placeholder="Central Forensic DNA Laboratory"
                                        value={formData.lab_name}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">City</label>
                                    <input
                                        type="text"
                                        name="city"
                                        className="form-control"
                                        placeholder="Dhaka"
                                        value={formData.city}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">Contact Number</label>
                                    <input
                                        type="text"
                                        name="contact_number"
                                        className="form-control"
                                        placeholder="+8801711000001"
                                        value={formData.contact_number}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">Email Address</label>
                                    <input
                                        type="email"
                                        name="email"
                                        className="form-control"
                                        placeholder="lab@forentrace.gov.bd"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="col-12">
                                    <label className="form-label small fw-semibold">Complete Address</label>
                                    <textarea
                                        name="address"
                                        className="form-control"
                                        rows={2}
                                        placeholder="CID Headquarters, Malibagh, Dhaka"
                                        value={formData.address}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="col-12 d-flex gap-2 pt-2">
                                    <button type="submit" className="btn btn-primary px-4">
                                        {editingId ? 'Update Laboratory' : 'Save Laboratory'}
                                    </button>
                                    <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Filter / Search Bar */}
            <div className="card mb-4 shadow-sm border-0">
                <div className="card-body">
                    <div className="row g-3 align-items-end">
                        <div className="col-md-5">
                            <label className="form-label small fw-semibold text-secondary">Search</label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Search by name, city, email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small fw-semibold text-secondary">Filter by City</label>
                            <select
                                className="form-select"
                                value={cityFilter}
                                onChange={(e) => setCityFilter(e.target.value)}
                            >
                                <option value="">All Cities</option>
                                {uniqueCities.map((city) => (
                                    <option key={city} value={city}>
                                        {city}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-3">
                            <button
                                type="button"
                                className="btn btn-outline-secondary w-100"
                                onClick={() => {
                                    setSearchQuery('');
                                    setCityFilter('');
                                }}
                            >
                                Clear Filters
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* DNA Labs Table */}
            {loading ? (
                <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status" />
                    <p className="mt-2 text-secondary">Loading live laboratory records...</p>
                </div>
            ) : (
                <div className="card shadow-sm border-0">
                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th className="ps-4">ID</th>
                                    <th>Lab Name</th>
                                    <th>City</th>
                                    <th>Address</th>
                                    <th>Contact</th>
                                    <th>Email</th>
                                    <th className="text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLabs.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="text-center py-4 text-muted">
                                            No DNA laboratories found matching your criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLabs.map((lab) => (
                                        <tr key={lab.lab_id}>
                                            <td className="ps-4 fw-bold text-secondary">#{lab.lab_id}</td>
                                            <td className="fw-semibold text-dark">{lab.lab_name}</td>
                                            <td>
                                                <span className="badge bg-light text-dark border">
                                                    {lab.city}
                                                </span>
                                            </td>
                                            <td className="small text-muted" style={{ maxWidth: '220px' }}>
                                                {lab.address}
                                            </td>
                                            <td className="small">{lab.contact_number}</td>
                                            <td className="small text-primary">{lab.email}</td>
                                            <td className="text-end pe-4">
                                                <div className="btn-group btn-group-sm">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-primary"
                                                        onClick={() => handleEdit(lab)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-danger"
                                                        onClick={() => handleDelete(lab.lab_id)}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}