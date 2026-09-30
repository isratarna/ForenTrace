import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getFamilyMembers,
  getFamilyMembersByPerson,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  registerFamilyDnaSample
} from '../services/familyMemberService';
import api from '../services/api';

const initialFormState = {
  person_id: '',
  first_name: '',
  last_name: '',
  relationship: '',
  gender: 'Male',
  phone: '',
  email: '',
  national_id: '',
  blood_group: '',
  address: '',
  remarks: '',
};

// Family reference DNA form (Member 1 - Issue 2)
// status pathano hoy na — backend shob notun sample 'Awaiting Analysis' diye shuru kore
const initialDnaFormState = {
  lab_id: '',
  technician_id: '',
  sample_type: 'Buccal Swab',
  collection_date: new Date().toISOString().split('T')[0],
  storage_location: '',
  remarks: '',
};

// Reference sample er jonno common sample type (DNA sample module er list er sathe mil)
const FAMILY_SAMPLE_TYPES = ['Buccal Swab', 'Blood Sample', 'Hair Strand'];

// onChanged: family add/edit/remove ba DNA register er por parent ke janay (FamilyDnaPanel refresh er jonno)
export default function FamilyMembersManager({ personId = null, allowDnaRegistration = true, onChanged = () => {} }) {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [missingPersons, setMissingPersons] = useState([]);
  const [labs, setLabs] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Add/Edit form states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    ...initialFormState,
    person_id: personId || '',
  });

  // Register DNA Sample modal states
  const [dnaTargetMember, setDnaTargetMember] = useState(null);
  const [dnaFormData, setDnaFormData] = useState(initialDnaFormState);

  const fetchAllData = async () => {
    setLoading(true);
    setError('');
    try {
      let data;
      if (personId) {
        data = await getFamilyMembersByPerson(personId);
      } else {
        data = await getFamilyMembers(searchQuery ? { search: searchQuery } : {});
      }
      setMembers(Array.isArray(data) ? data : data.data || []);

      // Load missing persons list if personId is not fixed
      if (!personId) {
        const mpRes = await api.get('/missing-persons');
        const mpData = mpRes.data;
        let personsList = Array.isArray(mpData) ? mpData : mpData.missingPersons || mpData.data || [];
        
        // Fallback: If api fails or is empty, extract unique persons from loaded members
        if (personsList.length === 0 && Array.isArray(data)) {
          const uniquePersons = {};
          data.forEach(m => {
            if (m.person_id && !uniquePersons[m.person_id]) {
              uniquePersons[m.person_id] = {
                id: m.person_id,
                person_id: m.person_id,
                first_name: m.missing_person_first_name || '',
                last_name: m.missing_person_last_name || '',
                status: m.missing_person_status || 'Unknown'
              };
            }
          });
          personsList = Object.values(uniquePersons);
        }
        setMissingPersons(personsList);
      }

      // Load labs & technicians for DNA sample registration
      const [labsRes, techRes] = await Promise.all([
        api.get('/labs').catch(() => ({ data: [] })),
        api.get('/technicians').catch(() => ({ data: [] })),
      ]);
      const lData = labsRes.data;
      setLabs(Array.isArray(lData) ? lData : lData.data || []);
      
      const tData = techRes.data;
      setTechnicians(Array.isArray(tData) ? tData : tData.data || []);
    } catch (err) {
      setError(err.message || 'Error loading data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [personId, searchQuery]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ ...initialFormState, person_id: personId || '' });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const handleOpenEdit = (member) => {
    setEditingId(member.family_id);
    setFormData({
      person_id: member.person_id || personId || '',
      first_name: member.first_name || '',
      last_name: member.last_name || '',
      relationship: member.relationship || '',
      gender: member.gender || 'Male',
      phone: member.phone || '',
      email: member.email || '',
      national_id: member.national_id || '',
      blood_group: member.blood_group || '',
      address: member.address || '',
      remarks: member.remarks || '',
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const payload = {
        ...formData,
        person_id: Number(personId || formData.person_id),
      };

      if (editingId) {
        await updateFamilyMember(editingId, payload);
        setSuccess('Family member updated successfully!');
      } else {
        await createFamilyMember(payload);
        setSuccess('Family member added successfully!');
      }

      setShowForm(false);
      setEditingId(null);
      fetchAllData();
      onChanged(); // family DNA panel refresh
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Operation failed');
    }
  };

  const handleDelete = async (familyId) => {
    if (!window.confirm('Are you sure you want to remove this family member?')) return;
    setError('');
    setSuccess('');

    try {
      await deleteFamilyMember(familyId);
      setSuccess('Family member removed successfully!');
      fetchAllData();
      onChanged(); // family DNA panel refresh (member er sample o cascade e delete hoy)
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to delete family member');
    }
  };

  const handleOpenDnaModal = (member) => {
    setDnaTargetMember(member);
    setDnaFormData({
      ...initialDnaFormState,
      remarks: `Reference DNA sample from ${member.first_name} ${member.last_name} (${member.relationship})`,
    });
    setError('');
    setSuccess('');
  };

  const handleRegisterDnaSubmit = async (e) => {
    e.preventDefault();
    if (!dnaTargetMember) return;
    setError('');
    setSuccess('');

    try {
      // Faka technician '' na pathiye null pathai (backend optional id hishebe nibe)
      const result = await registerFamilyDnaSample(dnaTargetMember.family_id, {
        ...dnaFormData,
        technician_id: dnaFormData.technician_id || null,
      });
      setSuccess(result.message || `DNA Sample registered for ${dnaTargetMember.first_name} ${dnaTargetMember.last_name}!`);
      setDnaTargetMember(null);
      onChanged(); // notun reference sample panel e dekhabe
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not register DNA sample');
    }
  };

  return (
    <div>
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Top Search & Action Bar */}
      <div className="card mb-4">
        <div className="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
          {!personId ? (
            <div className="flex-grow-1" style={{ maxWidth: '400px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search by name, relationship, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          ) : (
            <h5 className="mb-0">Registered Family Members ({members.length})</h5>
          )}

          <button className="btn btn-primary" onClick={handleOpenAdd}>
            + Add Family Member
          </button>
        </div>
      </div>

      {/* Add / Edit Family Member Form */}
      {showForm && (
        <div className="card mb-4">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <strong>{editingId ? 'Edit Family Member' : 'Add New Family Member'}</strong>
            <button
              type="button"
              className="btn btn-sm btn-light"
              onClick={() => setShowForm(false)}
            >
              Close
            </button>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit} className="row g-3">
              {!personId && (
                <div className="col-md-6">
                  <label className="form-label">Missing Person *</label>
                  <select
                    name="person_id"
                    className="form-select"
                    value={String(formData.person_id || '')}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">-- Select Missing Person --</option>
                    {missingPersons.map((mp) => {
                      const pId = mp.person_id || mp.id;
                      const fName = mp.first_name || mp.firstName || '';
                      const lName = mp.last_name || mp.lastName || '';
                      return (
                        <option key={pId} value={String(pId)}>
                          #{pId} - {fName} {lName} ({mp.status})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="col-md-3">
                <label className="form-label">First Name *</label>
                <input
                  type="text"
                  name="first_name"
                  className="form-control"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="col-md-3">
                <label className="form-label">Last Name *</label>
                <input
                  type="text"
                  name="last_name"
                  className="form-control"
                  value={formData.last_name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="col-md-3">
                <label className="form-label">Relationship *</label>
                <select
                  name="relationship"
                  className="form-select"
                  value={formData.relationship}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">-- Select --</option>
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Brother">Brother</option>
                  <option value="Sister">Sister</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Son">Son</option>
                  <option value="Daughter">Daughter</option>
                  <option value="Uncle">Uncle</option>
                  <option value="Aunt">Aunt</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="col-md-3">
                <label className="form-label">Gender</label>
                <select
                  name="gender"
                  className="form-select"
                  value={formData.gender}
                  onChange={handleInputChange}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="col-md-3">
                <label className="form-label">Phone *</label>
                <input
                  type="text"
                  name="phone"
                  className="form-control"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="col-md-3">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>

              <div className="col-md-3">
                <label className="form-label">National ID</label>
                <input
                  type="text"
                  name="national_id"
                  className="form-control"
                  value={formData.national_id}
                  onChange={handleInputChange}
                />
              </div>

              <div className="col-md-3">
                <label className="form-label">Blood Group</label>
                <select
                  name="blood_group"
                  className="form-select"
                  value={formData.blood_group}
                  onChange={handleInputChange}
                >
                  <option value="">-- Select --</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>

              <div className="col-md-6">
                <label className="form-label">Address</label>
                <input
                  type="text"
                  name="address"
                  className="form-control"
                  value={formData.address}
                  onChange={handleInputChange}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Remarks</label>
                <input
                  type="text"
                  name="remarks"
                  className="form-control"
                  value={formData.remarks}
                  onChange={handleInputChange}
                />
              </div>

              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Update Family Member' : 'Save Family Member'}
                </button>
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register Family DNA Sample Modal/Card */}
      {dnaTargetMember && (
        <div className="card mb-4">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <strong>
              Register Reference DNA Sample — {dnaTargetMember.first_name} {dnaTargetMember.last_name} ({dnaTargetMember.relationship})
            </strong>
            <button
              type="button"
              className="btn btn-sm btn-light"
              onClick={() => setDnaTargetMember(null)}
            >
              Close
            </button>
          </div>
          <div className="card-body">
            <form onSubmit={handleRegisterDnaSubmit} className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Sample Type *</label>
                <select
                  className="form-select"
                  value={dnaFormData.sample_type}
                  onChange={(e) => setDnaFormData({ ...dnaFormData, sample_type: e.target.value })}
                  required
                >
                  {FAMILY_SAMPLE_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="col-md-4">
                <label className="form-label">Assign DNA Lab *</label>
                <select
                  className="form-select"
                  value={dnaFormData.lab_id}
                  // Lab change hole purono technician baad (onno lab er technician assign atkano)
                  onChange={(e) => setDnaFormData({ ...dnaFormData, lab_id: e.target.value, technician_id: '' })}
                  required
                >
                  <option value="">-- Select Lab --</option>
                  {labs.map((lab) => (
                    <option key={lab.lab_id} value={lab.lab_id}>
                      {lab.lab_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-4">
                <label className="form-label">Assign Technician</label>
                <select
                  className="form-select"
                  value={dnaFormData.technician_id}
                  onChange={(e) => setDnaFormData({ ...dnaFormData, technician_id: e.target.value })}
                  disabled={!dnaFormData.lab_id}
                >
                  <option value="">-- Not assigned --</option>
                  {/* Shudhu selected lab er technician dekhabe */}
                  {technicians.filter((tech) => String(tech.lab_id) === String(dnaFormData.lab_id)).map((tech) => (
                    <option key={tech.technician_id} value={tech.technician_id}>
                      {tech.first_name} {tech.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-4">
                <label className="form-label">Collection Date *</label>
                <input
                  type="date"
                  className="form-control"
                  value={dnaFormData.collection_date}
                  onChange={(e) => setDnaFormData({ ...dnaFormData, collection_date: e.target.value })}
                  required
                />
              </div>

              <div className="col-md-4">
                <label className="form-label">Storage Location</label>
                <input
                  type="text"
                  className="form-control"
                  value={dnaFormData.storage_location}
                  onChange={(e) => setDnaFormData({ ...dnaFormData, storage_location: e.target.value })}
                />
              </div>

              <div className="col-md-4">
                <label className="form-label">Remarks</label>
                <input
                  type="text"
                  className="form-control"
                  value={dnaFormData.remarks}
                  onChange={(e) => setDnaFormData({ ...dnaFormData, remarks: e.target.value })}
                />
              </div>

              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-primary">
                  Confirm & Register DNA Sample
                </button>
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => setDnaTargetMember(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Family Members Table */}
      <div className="card">
        <div className="card-body">
          {loading ? (
            <p className="text-muted mb-0">Loading family members...</p>
          ) : members.length === 0 ? (
            <p className="text-muted mb-0">No family members found.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Relationship</th>
                    {!personId && <th>Missing Person</th>}
                    <th>Phone</th>
                    <th>Blood Group</th>
                    <th>Address</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.family_id}>
                      <td>#{m.family_id}</td>
                      <td>
                        <div className="fw-semibold">
                          {m.first_name} {m.last_name}
                        </div>
                        {m.email && <small className="text-muted">{m.email}</small>}
                      </td>
                      <td>
                        <span className="badge text-bg-secondary status-badge">{m.relationship}</span>
                      </td>
                      {!personId && (
                        <td>
                          {m.missing_person_first_name
                            ? `${m.missing_person_first_name} ${m.missing_person_last_name} (#${m.person_id})`
                            : `Person #${m.person_id}`}
                        </td>
                      )}
                      <td>{m.phone}</td>
                      <td>{m.blood_group || 'N/A'}</td>
                      <td>{m.address || 'N/A'}</td>
                      <td className="text-end">
                        <div className="d-flex justify-content-end gap-2">
                          {allowDnaRegistration && (
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleOpenDnaModal(m)}
                            >
                              Register DNA
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleOpenEdit(m)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(m.family_id)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}