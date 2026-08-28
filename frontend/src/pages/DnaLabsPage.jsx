import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api/labs';

export default function DnaLabsPage() {
    const [labs, setLabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchCity, setSearchCity] = useState('');

    const [formData, setFormData] = useState({
        lab_name: '',
        city: '',
        address: '',
        contact_number: '',
        email: '',
    });
    const [editingId, setEditingId] = useState(null);

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
                setLabs(data.data);
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
                setFormData({ lab_name: '', city: '', address: '', contact_number: '', email: '' });
                setEditingId(null);
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

    const filteredLabs = labs.filter((lab) =>
        lab.city.toLowerCase().includes(searchCity.toLowerCase()) ||
        lab.lab_name.toLowerCase().includes(searchCity.toLowerCase())
    );

    return (
        <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>DNA Laboratories Management</h2>

            {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>{error}</div>}
            {success && <div style={{ background: '#dcfce7', color: '#166534', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>{success}</div>}

            {/* Form Section */}
            <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>{editingId ? 'Edit DNA Lab' : 'Register New DNA Lab'}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    <input
                        type="text"
                        name="lab_name"
                        placeholder="Laboratory Name"
                        value={formData.lab_name}
                        onChange={handleInputChange}
                        required
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                    <input
                        type="text"
                        name="city"
                        placeholder="City"
                        value={formData.city}
                        onChange={handleInputChange}
                        required
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                    <input
                        type="text"
                        name="contact_number"
                        placeholder="Contact Number"
                        value={formData.contact_number}
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
                <textarea
                    name="address"
                    placeholder="Complete Address"
                    value={formData.address}
                    onChange={handleInputChange}
                    required
                    rows={2}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '12px', boxSizing: 'border-box' }}
                />
                <div>
                    <button type="submit" style={{ background: '#2563eb', color: '#fff', padding: '8px 18px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
                        {editingId ? 'Update Lab' : 'Save Lab'}
                    </button>
                    {editingId && (
                        <button
                            type="button"
                            onClick={() => { setEditingId(null); setFormData({ lab_name: '', city: '', address: '', contact_number: '', email: '' }); }}
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
                    placeholder="Filter by lab name or city..."
                    value={searchCity}
                    onChange={(e) => setSearchCity(e.target.value)}
                    style={{ width: '100%', maxWidth: '360px', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
            </div>

            {/* Labs List Table */}
            {loading ? (
                <p>Loading DNA labs...</p>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                        <thead style={{ background: '#f1f5f9' }}>
                            <tr>
                                <th style={{ padding: '12px' }}>ID</th>
                                <th style={{ padding: '12px' }}>Lab Name</th>
                                <th style={{ padding: '12px' }}>City</th>
                                <th style={{ padding: '12px' }}>Contact</th>
                                <th style={{ padding: '12px' }}>Email</th>
                                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLabs.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>No DNA laboratories found.</td>
                                </tr>
                            ) : (
                                filteredLabs.map((lab) => (
                                    <tr key={lab.lab_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{lab.lab_id}</td>
                                        <td style={{ padding: '12px' }}>{lab.lab_name}</td>
                                        <td style={{ padding: '12px' }}>{lab.city}</td>
                                        <td style={{ padding: '12px' }}>{lab.contact_number}</td>
                                        <td style={{ padding: '12px' }}>{lab.email}</td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <button onClick={() => handleEdit(lab)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '6px' }}>Edit</button>
                                            <button onClick={() => handleDelete(lab.lab_id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}