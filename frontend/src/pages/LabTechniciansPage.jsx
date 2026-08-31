import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/Ui';

const TECH_API = 'http://localhost:8000/api/technicians';
const LABS_API = 'http://localhost:8000/api/labs';

export default function LabTechniciansPage() {
    const [technicians, setTechnicians] = useState([]);
    const [labs, setLabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [labFilter, setLabFilter] = useState('');

    const [formData, setFormData] = useState({
        lab_id: '',
        first_name: '',
        last_name: '',
        designation: '',
        phone: '',
        email: '',
    });
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);

    // User linking state
    const [linkingTech, setLinkingTech] = useState(null);
    const [userIdInput, setUserIdInput] = useState('');
    const [linkingLoading, setLinkingLoading] = useState(false);

    useEffect(() => {
        fetchTechnicians();
        fetchLabs();
    }, []);

    const fetchTechnicians = async () => {
        try {
            setLoading(true);
            const res = await fetch(TECH_API, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setTechnicians(data.data || []);
            } else {
                setError(data.message || 'Failed to fetch technicians');
            }
        } catch (err) {
            setError('Error connecting to backend server');
        } finally {
            setLoading(false);
        }
    };

    const fetchLabs = async () => {
        try {
            const res = await fetch(LABS_API, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setLabs(data.data || []);
            }
        } catch (err) {
            console.error('Failed to fetch DNA Labs:', err);
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
            const url = editingId ? `${TECH_API}/${editingId}` : TECH_API;
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData),
            });

            const data = await res.json();
            if (data.success) {
                setSuccess(editingId ? 'Technician updated successfully!' : 'Technician registered successfully!');
                resetForm();
                fetchTechnicians();
            } else {
                setError(data.message || 'Action failed');
            }
        } catch (err) {
            setError('Request failed. Please check your network connection.');
        }
    };

    const handleEdit = (tech) => {
        setEditingId(tech.technician_id);
        setFormData({
            lab_id: tech.lab_id,
            first_name: tech.first_name,
            last_name: tech.last_name,
            designation: tech.designation,
            phone: tech.phone,
            email: tech.email,
        });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this laboratory technician?')) return;
        setError('');
        setSuccess('');

        try {
            const res = await fetch(`${TECH_API}/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = await res.json();
            if (data.success) {
                setSuccess('Technician deleted successfully');
                fetchTechnicians();
            } else {
                setError(data.message || 'Failed to delete technician');
            }
        } catch (err) {
            setError('Deletion request failed');
        }
    };

    const handleLinkUser = async (e) => {
        e.preventDefault();
        if (!linkingTech || !userIdInput) return;
        setError('');
        setSuccess('');
        setLinkingLoading(true);

        try {
            const res = await fetch(`${TECH_API}/${linkingTech.technician_id}/link-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ user_id: parseInt(userIdInput, 10) }),
            });

            const data = await res.json();
            if (data.success) {
                setSuccess(`Technician ${linkingTech.first_name} ${linkingTech.last_name} linked to User #${userIdInput} successfully!`);
                setLinkingTech(null);
                setUserIdInput('');
                fetchTechnicians();
            } else {
                setError(data.message || 'Failed to link user account');
            }
        } catch (err) {
            setError('User linking request failed');
        } finally {
            setLinkingLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({ lab_id: '', first_name: '', last_name: '', designation: '', phone: '', email: '' });
        setEditingId(null);
        setShowForm(false);
    };

    const filteredTechnicians = technicians.filter((tech) => {
        const fullName = `${tech.first_name || ''} ${tech.last_name || ''}`.toLowerCase();
        const q = searchQuery.toLowerCase();
        const matchesQuery =
            fullName.includes(q) ||
            tech.designation?.toLowerCase().includes(q) ||
            tech.lab_name?.toLowerCase().includes(q) ||
            tech.email?.toLowerCase().includes(q) ||
            tech.phone?.toLowerCase().includes(q);
        const matchesLab = labFilter ? String(tech.lab_id) === String(labFilter) : true;
        return matchesQuery && matchesLab;
    });

    return (
        <div className="container-fluid py-4">
            <PageHeader
                title="Lab Technicians"
                subtitle="Manage forensic laboratory technicians and personnel assignments."
                action={
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            resetForm();
                            setShowForm(!showForm);
                        }}
                    >
                        {showForm ? 'Close Form' : '+ Add Technician'}
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
                            {editingId ? 'Edit Lab Technician' : 'Register New Lab Technician'}
                        </h5>
                        <form onSubmit={handleSubmit}>
                            <div className="row g-3">
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">Assigned DNA Lab</label>
                                    <select
                                        name="lab_id"
                                        className="form-select"
                                        value={formData.lab_id}
                                        onChange={handleInputChange}
                                        required
                                    >
                                        <option value="">Select DNA Laboratory...</option>
                                        {labs.map((lab) => (
                                            <option key={lab.lab_id} value={lab.lab_id}>
                                                {lab.lab_name} ({lab.city})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">Designation</label>
                                    <input
                                        type="text"
                                        name="designation"
                                        className="form-control"
                                        placeholder="Senior DNA Analyst"
                                        value={formData.designation}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">First Name</label>
                                    <input
                                        type="text"
                                        name="first_name"
                                        className="form-control"
                                        placeholder="Tanvir"
                                        value={formData.first_name}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">Last Name</label>
                                    <input
                                        type="text"
                                        name="last_name"
                                        className="form-control"
                                        placeholder="Hossain"
                                        value={formData.last_name}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">Phone Number</label>
                                    <input
                                        type="text"
                                        name="phone"
                                        className="form-control"
                                        placeholder="+8801811000001"
                                        value={formData.phone}
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
                                        placeholder="tanvir.dna@forentrace.gov"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="col-12 d-flex gap-2 pt-2">
                                    <button type="submit" className="btn btn-primary px-4">
                                        {editingId ? 'Update Technician' : 'Save Technician'}
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
                                placeholder="Search by name, role, email, phone..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small fw-semibold text-secondary">Filter by Laboratory</label>
                            <select
                                className="form-select"
                                value={labFilter}
                                onChange={(e) => setLabFilter(e.target.value)}
                            >
                                <option value="">All DNA Laboratories</option>
                                {labs.map((lab) => (
                                    <option key={lab.lab_id} value={lab.lab_id}>
                                        {lab.lab_name} ({lab.city})
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
                                    setLabFilter('');
                                }}
                            >
                                Clear Filters
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Technicians List Table */}
            {loading ? (
                <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status" />
                    <p className="mt-2 text-secondary">Loading live technician records...</p>
                </div>
            ) : (
                <div className="card shadow-sm border-0">
                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th className="ps-4">ID</th>
                                    <th>Technician Name</th>
                                    <th>Assigned DNA Lab</th>
                                    <th>Designation</th>
                                    <th>Contact Info</th>
                                    <th>Account Link</th>
                                    <th className="text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTechnicians.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="text-center py-4 text-muted">
                                            No technicians found matching your criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTechnicians.map((tech) => (
                                        <tr key={tech.technician_id}>
                                            <td className="ps-4 fw-bold text-secondary">#{tech.technician_id}</td>
                                            <td className="fw-semibold text-dark">
                                                {tech.first_name} {tech.last_name}
                                            </td>
                                            <td>
                                                <div>
                                                    <span className="fw-medium">{tech.lab_name}</span>
                                                    {tech.lab_city && (
                                                        <span className="badge bg-light text-secondary ms-2 border">
                                                            {tech.lab_city}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge bg-info-subtle text-info-emphasis border">
                                                    {tech.designation}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="small text-primary">{tech.email}</div>
                                                <div className="small text-muted">{tech.phone}</div>
                                            </td>
                                            <td>
                                                {tech.user_id ? (
                                                    <span className="badge bg-success-subtle text-success-emphasis border">
                                                        Linked: User #{tech.user_id}
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-info"
                                                        onClick={() => {
                                                            setLinkingTech(tech);
                                                            setUserIdInput('');
                                                        }}
                                                    >
                                                        + Link User
                                                    </button>
                                                )}
                                            </td>
                                            <td className="text-end pe-4">
                                                <div className="btn-group btn-group-sm">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-primary"
                                                        onClick={() => handleEdit(tech)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-danger"
                                                        onClick={() => handleDelete(tech.technician_id)}
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

            {/* Link User Modal */}
            {linkingTech && (
                <div
                    className="modal show d-block"
                    tabIndex="-1"
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content shadow">
                            <div className="modal-header">
                                <h5 className="modal-title fw-bold">Link Technician to User Account</h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => setLinkingTech(null)}
                                />
                            </div>
                            <form onSubmit={handleLinkUser}>
                                <div className="modal-body">
                                    <p className="text-secondary small mb-3">
                                        Map <strong>{linkingTech.first_name} {linkingTech.last_name}</strong> (Technician #{linkingTech.technician_id}) to an active system User ID (1:1 relationship).
                                    </p>
                                    <div className="mb-3">
                                        <label className="form-label small fw-semibold">User ID</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            placeholder="Enter User ID (e.g. 1)"
                                            value={userIdInput}
                                            onChange={(e) => setUserIdInput(e.target.value)}
                                            required
                                            min="1"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button
                                        type="button"
                                        className="btn btn-light"
                                        onClick={() => setLinkingTech(null)}
                                        disabled={linkingLoading}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={linkingLoading}
                                    >
                                        {linkingLoading ? 'Linking...' : 'Link Account'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}