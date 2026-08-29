import React, { useState, useEffect } from 'react';

const TECH_API = 'http://localhost:8000/api/technicians';
const LABS_API = 'http://localhost:8000/api/labs';

export default function LabTechniciansPage() {
    const [technicians, setTechnicians] = useState([]);
    const [labs, setLabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState({
        lab_id: '',
        first_name: '',
        last_name: '',
        designation: '',
        phone: '',
        email: '',
    });
    const [editingId, setEditingId] = useState(null);

    // User linking state
    const [linkingTechId, setLinkingTechId] = useState(null);
    const [userIdInput, setUserIdInput] = useState('');

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
                setTechnicians(data.data);
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
                setLabs(data.data);
            }
        } catch (err) {
            console.error(err);
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
                setFormData({ lab_id: '', first_name: '', last_name: '', designation: '', phone: '', email: '' });
                setEditingId(null);
                fetchTechnicians();
            } else {
                setError(data.message || 'Action failed');
            }
        } catch (err) {
            setError('Request failed');
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
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this technician?')) return;
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
        if (!linkingTechId || !userIdInput) return;
        setError('');
        setSuccess('');

        try {
            const res = await fetch(`${TECH_API}/${linkingTechId}/link-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ user_id: parseInt(userIdInput, 10) }),
            });

            const data = await res.json();
            if (data.success) {
                setSuccess('Technician successfully linked to user account!');
                setLinkingTechId(null);
                setUserIdInput('');
                fetchTechnicians();
            } else {
                setError(data.message || 'Failed to link user');
            }
        } catch (err) {
            setError('User linking request failed');
        }
    };

    const filteredTechnicians = technicians.filter((tech) => {
        const fullName = `${tech.first_name} ${tech.last_name}`.toLowerCase();
        const q = searchQuery.toLowerCase();
        return fullName.includes(q) || tech.designation?.toLowerCase().includes(q) || tech.lab_name?.toLowerCase().includes(q);
    });

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>DNA Lab Technicians Management</h2>

            {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>{error}</div>}
            {success && <div style={{ background: '#dcfce7', color: '#166534', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>{success}</div>}

            {/* Form Section */}
            <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>{editingId ? 'Edit Technician' : 'Register New Technician'}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    <select
                        name="lab_id"
                        value={formData.lab_id}
                        onChange={handleInputChange}
                        required
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                        <option value="">Select DNA Lab...</option>
                        {labs.map((lab) => (
                            <option key={lab.lab_id} value={lab.lab_id}>
                                {lab.lab_name} ({lab.city})
                            </option>
                        ))}
                    </select>
                    <input
                        type="text"
                        name="first_name"
                        placeholder="First Name"
                        value={formData.first_name}
                        onChange={handleInputChange}
                        required
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                    <input
                        type="text"
                        name="last_name"
                        placeholder="Last Name"
                        value={formData.last_name}
                        onChange={handleInputChange}
                        required
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                    <input
                        type="text"
                        name="designation"
                        placeholder="Designation (e.g., DNA Analyst)"
                        value={formData.designation}
                        onChange={handleInputChange}
                        required
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                    <input
                        type="text"
                        name="phone"
                        placeholder="Phone Number"
                        value={formData.phone}
                        onChange={handleInputChange}
                        required
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                    <input
                        type="email"
                        name="email"
                        placeholder="Email Address"
                        value={formData.email}
                        onChange={handleInputChange}
                        required
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                </div>
                <div>
                    <button type="submit" style={{ background: '#2563eb', color: '#fff', padding: '8px 18px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
                        {editingId ? 'Update Technician' : 'Save Technician'}
                    </button>
                    {editingId && (
                        <button
                            type="button"
                            onClick={() => { setEditingId(null); setFormData({ lab_id: '', first_name: '', last_name: '', designation: '', phone: '', email: '' }); }}
                            style={{ background: '#64748b', color: '#fff', padding: '8px 18px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '8px' }}
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </form>

            {/* Filter / Search Bar */}
            <div style={{ marginBottom: '16px' }}>
                <input
                    type="text"
                    placeholder="Filter by technician name, role, or lab..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
            </div>

            {/* Technicians List Table */}
            {loading ? (
                <p>Loading technicians...</p>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                        <thead style={{ background: '#f1f5f9' }}>
                            <tr>
                                <th style={{ padding: '12px' }}>ID</th>
                                <th style={{ padding: '12px' }}>Technician Name</th>
                                <th style={{ padding: '12px' }}>Assigned Lab</th>
                                <th style={{ padding: '12px' }}>Designation</th>
                                <th style={{ padding: '12px' }}>Contact Info</th>
                                <th style={{ padding: '12px' }}>User ID</th>
                                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTechnicians.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>No technicians found.</td>
                                </tr>
                            ) : (
                                filteredTechnicians.map((tech) => (
                                    <tr key={tech.technician_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{tech.technician_id}</td>
                                        <td style={{ padding: '12px' }}>{tech.first_name} {tech.last_name}</td>
                                        <td style={{ padding: '12px' }}>{tech.lab_name} <span style={{ color: '#64748b', fontSize: '12px' }}>({tech.lab_city})</span></td>
                                        <td style={{ padding: '12px' }}>{tech.designation}</td>
                                        <td style={{ padding: '12px' }}>
                                            <div>{tech.email}</div>
                                            <div style={{ color: '#64748b', fontSize: '12px' }}>{tech.phone}</div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            {tech.user_id ? (
                                                <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>User #{tech.user_id}</span>
                                            ) : (
                                                <button
                                                    onClick={() => setLinkingTechId(tech.technician_id)}
                                                    style={{ background: '#e0e7ff', color: '#3730a3', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                    + Link User
                                                </button>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <button onClick={() => handleEdit(tech)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '6px' }}>Edit</button>
                                            <button onClick={() => handleDelete(tech.technician_id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Link User Modal / Form */}
            {linkingTechId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <form onSubmit={handleLinkUser} style={{ background: '#fff', padding: '24px', borderRadius: '8px', width: '320px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>Link Technician to User</h3>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>Enter the User ID to map with Technician #{linkingTechId}</p>
                        <input
                            type="number"
                            placeholder="User ID"
                            value={userIdInput}
                            onChange={(e) => setUserIdInput(e.target.value)}
                            required
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '16px', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => { setLinkingTechId(null); setUserIdInput(''); }}
                                style={{ background: '#64748b', color: '#fff', padding: '6px 14px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                style={{ background: '#2563eb', color: '#fff', padding: '6px 14px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Link Account
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}