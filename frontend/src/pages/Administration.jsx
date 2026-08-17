import { useEffect, useMemo, useState } from 'react'
import { PageHeader, SearchFilters, StatusBadge } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { useData } from '../data/DataContext'
import { changePassword } from '../services/mockAuth'
import { getUsers, updateUser, updateUserStatus } from '../services/userService'

const recordConfig = {
  stations: { title: 'Police Stations', subtitle: 'Manage police station records.', button: 'Add Station', fields: [['name', 'Station name'], ['district', 'District'], ['city', 'City'], ['address', 'Address'], ['contact', 'Contact'], ['email', 'Email', 'email']] },
  officers: { title: 'Police Officers', subtitle: 'Manage officer records and station assignments.', button: 'Add Officer', fields: [['name', 'Full name'], ['rank', 'Rank'], ['badge', 'Badge number'], ['station', 'Police station'], ['phone', 'Phone'], ['email', 'Email', 'email'], ['status', 'Status', 'select', ['Active', 'Inactive']]] },
  labs: { title: 'DNA Labs', subtitle: 'Manage forensic DNA laboratory records.', button: 'Add DNA Lab', fields: [['name', 'Lab name'], ['city', 'City'], ['address', 'Address'], ['contact', 'Contact'], ['email', 'Email', 'email']] },
  technicians: { title: 'Lab Technicians', subtitle: 'Manage technician records and laboratory assignments.', button: 'Add Technician', fields: [['name', 'Full name'], ['designation', 'Designation'], ['lab', 'DNA laboratory'], ['phone', 'Phone'], ['email', 'Email', 'email'], ['status', 'Status', 'select', ['Active', 'Inactive']]] },
}

const displayColumns = {
  stations: [['name', 'Station'], ['district', 'District'], ['city', 'City'], ['contact', 'Contact'], ['email', 'Email']],
  officers: [['name', 'Officer'], ['rank', 'Rank'], ['badge', 'Badge Number'], ['station', 'Police Station'], ['phone', 'Phone'], ['email', 'Email'], ['status', 'Status']],
  labs: [['name', 'Lab'], ['city', 'City'], ['address', 'Address'], ['contact', 'Contact'], ['email', 'Email']],
  technicians: [['name', 'Technician'], ['designation', 'Designation'], ['lab', 'DNA Lab'], ['phone', 'Phone'], ['email', 'Email'], ['status', 'Status']],
  users: [['name', 'Name'], ['email', 'Email'], ['role', 'Role'], ['linked', 'Linked Person'], ['status', 'Status'], ['lastLogin', 'Last Login']],
}

const emptyRecord = fields => Object.fromEntries(fields.map(([key]) => [key, key === 'status' ? 'Active' : '']))
const isStatus = key => key === 'status'

function RecordForm({ title, fields, value, onCancel, onSave }) {
  const [form, setForm] = useState(value)
  useEffect(() => setForm(value), [value])
  return <form className="card mb-4" onSubmit={event => { event.preventDefault(); onSave(form) }}><div className="card-header bg-white"><strong>{title}</strong></div><div className="card-body"><div className="row g-3">{fields.map(([key, label, type = 'text', options = []]) => <div className="col-md-6" key={key}><label className="form-label">{label}</label>{type === 'select' ? <select className="form-select" value={form[key] || ''} onChange={event => setForm({ ...form, [key]: event.target.value })} required><option value="">Select {label}</option>{options.map(option => <option key={option}>{option}</option>)}</select> : <input className="form-control" type={type} value={form[key] || ''} onChange={event => setForm({ ...form, [key]: event.target.value })} required={key === 'name' || key === 'email'}/>}</div>)}</div></div><div className="card-footer bg-white text-end"><button type="button" onClick={onCancel} className="btn btn-light me-2">Cancel</button><button className="btn btn-primary">Save Changes</button></div></form>
}

export function AdminList({ kind }) {
  const { data, addAdminRecord, updateAdminRecord, removeAdminRecord } = useData()
  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [accountRows, setAccountRows] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const config = recordConfig[kind]

  const refreshAccounts = async () => {
    try {
      setUsersLoading(true)
      setUsersError('')
      const users = await getUsers()
      setAccountRows(users)
    } catch (error) {
      setUsersError(error.response?.data?.message || 'Failed to load users.')
    } finally {
      setUsersLoading(false)
    }
  }

  useEffect(() => {
    if (kind !== 'users') return undefined
    refreshAccounts()
  }, [kind])

  const rows = kind === 'users' ? accountRows : data[kind]
  const columns = displayColumns[kind]
  const filtered = useMemo(() => rows.filter(row => (!activeOnly || row.status === 'Active') && (!query || Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase())))), [rows, activeOnly, query])
  const fields = kind === 'users' ? [['name', 'Full name'], ['email', 'Email', 'email'], ['role', 'Role', 'select', ['Admin', 'Officer', 'Lab Technician']], ['linked', 'Linked person'], ['station', 'Police station'], ['lab', 'DNA laboratory'], ['status', 'Status', 'select', ['Pending Approval', 'Active', 'Inactive']]] : config.fields
  const save = async values => {
    if (kind === 'users') {
      try {
        await updateUser(editing.id, {
          name: values.name,
          email: values.email,
          role: values.role,
        })
        if (values.status !== editing.status) {
          await updateUserStatus(editing.id, values.status)
        }
        await refreshAccounts()
        setEditing(null)
      } catch (error) {
        window.alert(error.response?.data?.message || 'Failed to update user.')
      }
      return
    }
    if (editing?.id) updateAdminRecord(kind, editing.id, values)
    else addAdminRecord(kind, values)
    setEditing(null)
  }
  const remove = record => {
    if (!window.confirm(`Delete ${record.name}?`)) return
    const result = removeAdminRecord(kind, record.id)
    if (!result.ok) window.alert(result.message)
  }
  const title = kind === 'users' ? 'Users & Accounts' : config.title
  const subtitle = kind === 'users' ? 'Manage registered officer and laboratory accounts. New accounts are created through registration.' : config.subtitle

  return <><PageHeader title={title} subtitle={subtitle} action={kind === 'users' ? null : <button onClick={() => { setViewing(null); setEditing(emptyRecord(fields)) }} className="btn btn-primary">{config.button}</button>}/>{kind === 'users' && usersError && <div className="alert alert-danger">{usersError}</div>}{editing && <RecordForm title={editing.id ? `Edit ${editing.name || editing.id}` : config.button} fields={fields} value={editing} onCancel={() => setEditing(null)} onSave={save}/>}<SearchFilters onSearchChange={setQuery} onClear={() => setActiveOnly(false)}><div className="col-md-3"><label className="form-label">Filter</label><select value={activeOnly ? 'active' : ''} onChange={event => setActiveOnly(event.target.value === 'active')} className="form-select"><option value="">All records</option><option value="active">Active only</option></select></div></SearchFilters>{viewing && <div className="alert alert-info d-flex justify-content-between align-items-center"><span><b>{viewing.name}</b> · ID {viewing.id}</span><button onClick={() => setViewing(null)} className="btn btn-sm btn-outline-secondary">Close</button></div>}<div className="card"><div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Actions</th></tr></thead><tbody>{kind === 'users' && usersLoading ? <tr><td colSpan={columns.length + 1} className="text-center text-secondary py-4">Loading users...</td></tr> : filtered.map(row => <tr key={row.id}>{columns.map(([key]) => <td key={key}>{isStatus(key) ? <StatusBadge value={row[key]}/> : row[key] || '—'}</td>)}<td className="text-nowrap"><button onClick={() => setViewing(row)} className="btn btn-sm btn-outline-primary me-1">View</button><button onClick={() => { setViewing(null); setEditing(row) }} className="btn btn-sm btn-outline-secondary me-1">Edit</button>{kind !== 'users' && <button onClick={() => remove(row)} className="btn btn-sm btn-outline-danger">Delete</button>}</td></tr>)}{kind !== 'users' || !usersLoading ? !filtered.length && <tr><td colSpan={columns.length + 1} className="text-center text-secondary py-4">No matching records found.</td></tr> : null}</tbody></table></div></div></>
}

export function Reports() {
  const { data } = useData(); const solved = data.cases.filter(caseItem => caseItem.status === 'Solved').length; const pending = data.cases.filter(caseItem => caseItem.status === 'Pending').length; const analyzed = data.samples.filter(sample => sample.status === 'Analyzed').length; const top = [...data.matches].sort((first, second) => parseFloat(second.similarity) - parseFloat(first.similarity))[0]; const reportCards = [['Highest DNA similarity match', top?.id || '—', top ? `${top.similarity} similarity` : 'No matches'], ['Solved investigations', String(solved), 'Current records'], ['Pending investigations', String(pending), 'Across all police stations'], ['Samples analyzed', String(analyzed), `of ${data.samples.length} collected samples`], ['Total missing-person reports', String(data.missingPeople.length), 'Current registry']]; const exportReport = () => { const rows = [['ForenTrace Report', new Date().toLocaleDateString()], [], ['Metric', 'Value', 'Detail'], ...reportCards.map(card => [card[0], card[1], card[2]]), [], ['Cases'], ['Case ID', 'Missing Person', 'Status', 'Priority'], ...data.cases.map(caseItem => [caseItem.id, caseItem.person, caseItem.status, caseItem.priority])]; const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `forentrace-report-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url) }; return <><PageHeader title="Reports" subtitle="System statistics and reporting summaries." action={<button onClick={exportReport} className="btn btn-outline-primary">Export Report (CSV)</button>}/><div className="row g-3 mb-4">{reportCards.map(card => <div className="col-md-6 col-xl" key={card[0]}><div className="card report-card h-100"><div className="card-body"><p className="small text-secondary">{card[0]}</p><h3>{card[1]}</h3><small className="text-secondary">{card[2]}</small></div></div></div>)}</div><div className="card"><div className="card-header bg-white"><strong>Case resolution overview</strong></div><div className="card-body"><div className="bar-row"><span>Solved</span><div className="progress"><div className="progress-bar bg-success" style={{ width: `${data.cases.length ? solved / data.cases.length * 100 : 0}%` }}/></div><b>{solved}</b></div><div className="bar-row"><span>Active</span><div className="progress"><div className="progress-bar" style={{ width: `${data.cases.length ? data.cases.filter(caseItem => caseItem.status === 'Active').length / data.cases.length * 100 : 0}%` }}/></div><b>{data.cases.filter(caseItem => caseItem.status === 'Active').length}</b></div><div className="bar-row"><span>Pending</span><div className="progress"><div className="progress-bar bg-warning" style={{ width: `${data.cases.length ? pending / data.cases.length * 100 : 0}%` }}/></div><b>{pending}</b></div></div></div></>
}

export function Profile() {
  const { user } = useAuth(); const roleName = user.role === 'Officer' ? 'Police Officer' : user.role; const [editingPassword, setEditingPassword] = useState(false); const [form, setForm] = useState({ current: '', next: '' }); const [message, setMessage] = useState(''); const submitPassword = event => { event.preventDefault(); try { changePassword(user.id, form.current, form.next); setMessage('Password updated.'); setForm({ current: '', next: '' }); setEditingPassword(false) } catch (error) { setMessage(error.message) } }
  return <><PageHeader title="My Profile" subtitle="Your authorized system account details."/><div className="row g-4"><div className="col-lg-4"><div className="card"><div className="card-body text-center py-5"><div className="profile-avatar">{user.initials}</div><h4 className="mt-3 mb-1">{user.name}</h4><p className="text-secondary mb-2">{roleName}</p><StatusBadge value={user.status || 'Active'}/></div></div></div><div className="col-lg-8"><div className="card"><div className="card-header bg-white"><strong>Account information</strong></div><div className="card-body"><div className="detail-grid"><span>Name<b>{user.name}</b></span><span>Email<b>{user.email}</b></span><span>Role<b>{roleName}</b></span><span>Account type<b>{user.role === 'Admin' ? 'Predefined administrator account' : 'Registered user account'}</b></span></div>{message && <div className={`alert ${message === 'Password updated.' ? 'alert-success' : 'alert-danger'} mt-3 mb-0`}>{message}</div>}</div><div className="card-footer bg-white">{editingPassword ? <form className="row g-2" onSubmit={submitPassword}><div className="col-md-5"><input className="form-control" type="password" placeholder="Current password" value={form.current} onChange={event => setForm({ ...form, current: event.target.value })} required/></div><div className="col-md-5"><input className="form-control" type="password" placeholder="New password" value={form.next} onChange={event => setForm({ ...form, next: event.target.value })} required/></div><div className="col-md-2 d-flex gap-2"><button className="btn btn-primary">Save</button><button type="button" onClick={() => setEditingPassword(false)} className="btn btn-light">Cancel</button></div></form> : <button onClick={() => { setMessage(''); setEditingPassword(true) }} className="btn btn-outline-primary">Change Password</button>}</div></div></div></div></>
}
