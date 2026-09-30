import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, SearchFilters, StatusBadge } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { useData } from '../data/DataContext'
import { changeOwnPassword, createManagedUser, getUsers, resetUserPassword, updateUser, updateUserStatus, deleteUser } from '../services/userService'
import { getOfficers, createOfficer, updateOfficer, deleteOfficer } from '../services/officerService'
import { getStations, createStation, updateStation, deleteStation } from '../services/policeStationService'
import caseService from '../services/caseService'
import { getLabs, getLabsWithoutTechnicians, getMatches, getSamples } from '../services/dnaService' // report export er DNA metric real API theke (Member 1 - Issue 7)

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
const backendKinds = ['users', 'officers', 'stations']

function RecordForm({ title, fields, value, onCancel, onSave }) {
  const [form, setForm] = useState(value)
  useEffect(() => setForm(value), [value])
  return <form className="card mb-4" onSubmit={event => { event.preventDefault(); onSave(form) }}><div className="card-header bg-white"><strong>{title}</strong></div><div className="card-body"><div className="row g-3">{fields.map(([key, label, type = 'text', options = []]) => <div className="col-md-6" key={key}><label className="form-label">{label}</label>{type === 'select' ? <select className="form-select" value={form[key] || ''} onChange={event => setForm({ ...form, [key]: event.target.value })} required><option value="">Select {label}</option>{options.map(option => <option key={option}>{option}</option>)}</select> : <input className="form-control" type={type} value={form[key] || ''} onChange={event => setForm({ ...form, [key]: event.target.value })} required={key === 'name' || key === 'email'} />}</div>)}</div></div><div className="card-footer bg-white text-end"><button type="button" onClick={onCancel} className="btn btn-light me-2">Cancel</button><button className="btn btn-primary">Save Changes</button></div></form>
}

function ManagedUserForm({ stations, labs, onCreated }) {
  const emptyForm = {
    role: 'Officer',
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    phone: '',
    rank: '',
    badgeNumber: '',
    stationId: '',
    designation: '',
    labId: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const update = event => {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }))
    setError('')
    setSuccess('')
  }

  const submit = async event => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    const payload = {
      role: form.role,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      username: form.username || undefined,
      password: form.password,
      phone: form.phone,
      ...(form.role === 'Officer'
        ? { rank: form.rank, badgeNumber: form.badgeNumber, stationId: form.stationId }
        : { designation: form.designation, labId: form.labId }),
    }

    try {
      const result = await createManagedUser(payload)
      setForm(emptyForm)
      setSuccess(`${result.message} Username: ${result.user.username}.`)
      await onCreated()
    } catch (submissionError) {
      setError(submissionError.response?.data?.message || 'Failed to create account.')
    } finally {
      setSaving(false)
    }
  }

  const field = (name, label, type = 'text', attributes = {}) => (
    <div className="col-md-6" key={name}>
      <label className="form-label" htmlFor={`create-user-${name}`}>{label}</label>
      <input
        {...attributes}
        id={`create-user-${name}`}
        className="form-control"
        name={name}
        type={type}
        value={form[name]}
        onChange={update}
        required={attributes.required !== false}
      />
    </div>
  )

  return <form className="card mb-4" onSubmit={submit}>
    <div className="card-header bg-white"><strong>Create operational account</strong></div>
    <div className="card-body">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="create-user-role">Role</label>
          <select id="create-user-role" className="form-select" name="role" value={form.role} onChange={update}>
            <option value="Officer">Officer</option>
            <option value="Lab Technician">Lab Technician</option>
          </select>
        </div>
        {field('firstName', 'First name')}
        {field('lastName', 'Last name')}
        {field('email', 'Email', 'email')}
        {field('username', 'Username (optional)', 'text', { required: false })}
        {field('password', 'Password (minimum 6 characters)', 'password', { minLength: 6, autoComplete: 'new-password' })}
        {field('phone', 'Phone')}
        {form.role === 'Officer' ? <>
          {field('rank', 'Rank')}
          {field('badgeNumber', 'Badge number')}
          <div className="col-md-6">
            <label className="form-label" htmlFor="create-user-stationId">Police station</label>
            <select id="create-user-stationId" className="form-select" name="stationId" value={form.stationId} onChange={update} required>
              <option value="">Select police station</option>
              {stations.map(station => {
                const id = station.stationId ?? station.station_id ?? station.id
                return <option key={id} value={id}>{station.name ?? station.stationName ?? station.station_name}</option>
              })}
            </select>
          </div>
        </> : <>
          {field('designation', 'Designation')}
          <div className="col-md-6">
            <label className="form-label" htmlFor="create-user-labId">Laboratory</label>
            <select id="create-user-labId" className="form-select" name="labId" value={form.labId} onChange={update} required>
              <option value="">Select laboratory</option>
              {labs.map(lab => {
                const id = lab.lab_id ?? lab.labId ?? lab.id
                return <option key={id} value={id}>{lab.lab_name ?? lab.name}</option>
              })}
            </select>
          </div>
        </>}
      </div>
    </div>
    <div className="card-footer bg-white text-end">
      <button className="btn btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create account'}</button>
    </div>
  </form>
}

function AdminPasswordResetForm({ account, onCancel, onSave }) {
  const [newPassword, setNewPassword] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async event => {
    event.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const result = await onSave(account.id, newPassword)
      setNewPassword('')
      setFeedback({ success: true, message: result.message || 'Password reset successfully.' })
    } catch (error) {
      setFeedback({ success: false, message: error.response?.data?.message || 'Failed to reset password.' })
    } finally {
      setSaving(false)
    }
  }

  return <form className="card mb-4" onSubmit={submit}>
    <div className="card-header bg-white"><strong>Reset password for {account.name}</strong></div>
    <div className="card-body">
      {feedback && <div className={`alert ${feedback.success ? 'alert-success' : 'alert-danger'}`} role={feedback.success ? 'status' : 'alert'}>{feedback.message}</div>}
      <label className="form-label" htmlFor="admin-reset-password">New password</label>
      <input
        id="admin-reset-password"
        className="form-control"
        type="password"
        value={newPassword}
        onChange={event => setNewPassword(event.target.value)}
        minLength={6}
        autoComplete="new-password"
        required
      />
    </div>
    <div className="card-footer bg-white text-end">
      <button type="button" onClick={onCancel} className="btn btn-light me-2">Close</button>
      <button className="btn btn-primary" disabled={saving}>{saving ? 'Resetting...' : 'Reset password'}</button>
    </div>
  </form>
}

export function AdminList({ kind }) {
  const { user: currentUser } = useAuth()
  const { data, addAdminRecord, updateAdminRecord, removeAdminRecord } = useData()
  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [accountRows, setAccountRows] = useState([])
  const [stationRows, setStationRows] = useState(data.stations)
  const [labRows, setLabRows] = useState([])
  const [creatingUser, setCreatingUser] = useState(false)
  const [resettingUser, setResettingUser] = useState(null)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const config = recordConfig[kind]

  const refreshRecords = useCallback(async () => {
    try {
      setUsersLoading(true)
      setUsersError('')
      if (kind === 'users') {
        const [users, stations, labs] = await Promise.all([getUsers(), getStations(), getLabs()])
        setAccountRows(users)
        setStationRows(stations)
        setLabRows(labs)
      } else if (kind === 'officers') {
        const [officers, stations] = await Promise.all([getOfficers(), getStations()])
        setAccountRows(officers)
        setStationRows(stations)
      } else if (kind === 'stations') {
        const stations = await getStations()
        setAccountRows(stations)
        setStationRows(stations)
      }
    } catch (error) {
      setUsersError(error.response?.data?.message || `Failed to load ${kind}.`)
    } finally {
      setUsersLoading(false)
    }
  }, [kind])

  useEffect(() => {
    if (!backendKinds.includes(kind)) return undefined
    refreshRecords()
  }, [kind, refreshRecords])

  const rows = backendKinds.includes(kind) ? accountRows : data[kind]
  const columns = displayColumns[kind]
  const filtered = useMemo(() => rows.filter(row => (!activeOnly || row.status === 'Active') && (!query || Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase())))), [rows, activeOnly, query])

  const fields = useMemo(() => {
    if (kind === 'users') {
      return [['name', 'Full name'], ['email', 'Email', 'email'], ['role', 'Role', 'select', ['Admin', 'Officer', 'Lab Technician']]]
    }
    const baseFields = config.fields
    if (kind === 'officers') {
      const stationNames = stationRows.map(s => s.name)
      return baseFields.map(f => f[0] === 'station' ? [f[0], f[1], 'select', stationNames] : f)
    }
    return baseFields
  }, [kind, config, stationRows])

  const save = async values => {
    if (kind === 'users') {
      try {
        await updateUser(editing.id, {
          name: values.name,
          email: values.email,
          role: values.role,
        })
        await refreshRecords()
        setEditing(null)
      } catch (error) {
        window.alert(error.response?.data?.message || 'Failed to update user.')
      }
      return
    }

    if (kind === 'stations') {
      try {
        const stationPayload = {
          name: values.name,
          district: values.district,
          city: values.city,
          address: values.address,
          contact: values.contact,
          email: values.email,
        }

        if (editing?.id) {
          await updateStation(editing.id, stationPayload)
        } else {
          await createStation(stationPayload)
        }
        await refreshRecords()
        setEditing(null)
      } catch (error) {
        window.alert(error.response?.data?.message || `Failed to ${editing?.id ? 'update' : 'create'} police station.`)
      }
      return
    }

    if (kind === 'officers') {
      try {
        const selectedStation = stationRows.find(s => s.name === values.station)
        let stationId = selectedStation?.stationId || selectedStation?.station_id
        if (!stationId && selectedStation?.id) {
          const numMatch = String(selectedStation.id).match(/\d+/)
          stationId = numMatch ? parseInt(numMatch[0], 10) : null
        }

        const officerPayload = {
          name: values.name,
          rank: values.rank,
          badge: values.badge,
          phone: values.phone,
          email: values.email,
          stationId: stationId,
        }

        if (editing?.id) {
          await updateOfficer(editing.id, officerPayload)
        } else {
          await createOfficer(officerPayload)
        }
        await refreshRecords()
        setEditing(null)
      } catch (error) {
        window.alert(error.response?.data?.message || `Failed to ${editing?.id ? 'update' : 'create'} officer.`)
      }
      return
    }

    if (editing?.id) updateAdminRecord(kind, editing.id, values)
    else addAdminRecord(kind, values)
    setEditing(null)
  }

  const remove = async record => {
    if (!window.confirm(`Delete ${record.name}?`)) return
    if (kind === 'stations') {
      try {
        await deleteStation(record.id)
        await refreshRecords()
      } catch (error) {
        window.alert(error.response?.data?.message || 'Failed to delete police station.')
      }
      return
    }

    if (kind === 'officers') {
      try {
        await deleteOfficer(record.id)
        await refreshRecords()
      } catch (error) {
        window.alert(error.response?.data?.message || 'Failed to delete officer.')
      }
      return
    }
    const result = removeAdminRecord(kind, record.id)
    if (!result.ok) window.alert(result.message)
  }

  const activateUser = async record => {
    if (!window.confirm(`Activate ${record.name}?`)) return
    try {
      await updateUserStatus(record.id, 'Active')
      await refreshRecords()
    } catch (error) {
      window.alert(error.response?.data?.message || 'Failed to activate user.')
    }
  }

  const saveUserPassword = async (userId, newPassword) => {
    const result = await resetUserPassword(userId, newPassword)
    await refreshRecords()
    return result
  }

  const deactivateUser = async record => {
    if (!window.confirm(`Deactivate ${record.name}?`)) return
    try {
      await deleteUser(record.id)
      await refreshRecords()
    } catch (error) {
      window.alert(error.response?.data?.message || 'Failed to deactivate user.')
    }
  }

  const userActions = row => <>
    <button onClick={() => setViewing(row)} className="btn btn-sm btn-outline-primary me-1">View</button>
    <button onClick={() => { setViewing(null); setResettingUser(null); setEditing(row) }} className="btn btn-sm btn-outline-secondary me-1">Edit</button>
    <button onClick={() => { setEditing(null); setResettingUser(row) }} className="btn btn-sm btn-outline-secondary me-1">Reset Password</button>
    {row.status === 'Active'
      ? <button onClick={() => deactivateUser(row)} className="btn btn-sm btn-outline-danger" disabled={row.role === 'Admin' && Number(row.id) === Number(currentUser?.id)} title={row.role === 'Admin' && Number(row.id) === Number(currentUser?.id) ? 'You cannot deactivate your own account.' : undefined}>Deactivate</button>
      : <button onClick={() => activateUser(row)} className="btn btn-sm btn-outline-success">Activate</button>}
  </>

  const title = kind === 'users' ? 'Users & Accounts' : config.title
  const subtitle = kind === 'users' ? 'Create and manage officer and laboratory accounts.' : config.subtitle

  return <>
    <PageHeader title={title} subtitle={subtitle} action={kind === 'users'
      ? <button onClick={() => { setCreatingUser(value => !value); setEditing(null); setResettingUser(null) }} className="btn btn-primary">{creatingUser ? 'Close form' : 'Create account'}</button>
      : <button onClick={() => { setViewing(null); setEditing(emptyRecord(fields)) }} className="btn btn-primary">{config.button}</button>} />
    {backendKinds.includes(kind) && usersError && <div className="alert alert-danger">{usersError}</div>}
    {kind === 'users' && creatingUser && <ManagedUserForm stations={stationRows} labs={labRows} onCreated={refreshRecords} />}
    {resettingUser && <AdminPasswordResetForm account={resettingUser} onCancel={() => setResettingUser(null)} onSave={saveUserPassword} />}
    {editing && <RecordForm title={editing.id ? `Edit ${editing.name || editing.id}` : config.button} fields={fields} value={editing} onCancel={() => setEditing(null)} onSave={save} />}
    <SearchFilters onSearchChange={setQuery} onClear={() => setActiveOnly(false)}>
      <div className="col-md-3"><label className="form-label">Filter</label><select value={activeOnly ? 'active' : ''} onChange={event => setActiveOnly(event.target.value === 'active')} className="form-select"><option value="">All records</option><option value="active">Active only</option></select></div>
    </SearchFilters>
    {viewing && <div className="alert alert-info d-flex justify-content-between align-items-center"><span><b>{viewing.name}</b> · ID {viewing.id}</span><button onClick={() => setViewing(null)} className="btn btn-sm btn-outline-secondary">Close</button></div>}
    <div className="card"><div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Actions</th></tr></thead><tbody>{backendKinds.includes(kind) && usersLoading ? <tr><td colSpan={columns.length + 1} className="text-center text-secondary py-4">Loading {kind}...</td></tr> : filtered.map(row => <tr key={row.id}>{columns.map(([key]) => <td key={key}>{isStatus(key) ? <StatusBadge value={row[key]} /> : row[key] || '—'}</td>)}<td className="text-nowrap">{kind === 'users' ? userActions(row) : <><button onClick={() => setViewing(row)} className="btn btn-sm btn-outline-primary me-1">View</button><button onClick={() => { setViewing(null); setEditing(row) }} className="btn btn-sm btn-outline-secondary me-1">Edit</button><button onClick={() => remove(row)} className="btn btn-sm btn-outline-danger">Delete</button></>}</td></tr>)}{(!backendKinds.includes(kind) || !usersLoading) ? !filtered.length && <tr><td colSpan={columns.length + 1} className="text-center text-secondary py-4">No matching records found.</td></tr> : null}</tbody></table></div></div>
  </>
}

export function Reports() {
  const { data } = useData()
  const [caseStats, setCaseStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [labsWithoutTechnicians, setLabsWithoutTechnicians] = useState([])
  const [labsWithoutTechniciansLoading, setLabsWithoutTechniciansLoading] = useState(true)
  const [labsWithoutTechniciansError, setLabsWithoutTechniciansError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    caseService.getCaseStatistics()
      .then(stats => { if (!mounted) return; setCaseStats(stats) })
      .catch(err => { console.error('Failed to load case statistics', err); if (!mounted) return; setError('Failed to load statistics') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let active = true
    getLabsWithoutTechnicians()
      .then(labs => { if (active) setLabsWithoutTechnicians(labs) })
      .catch(requestError => { if (active) setLabsWithoutTechniciansError(requestError.response?.data?.message || 'Failed to load labs without technicians.') })
      .finally(() => { if (active) setLabsWithoutTechniciansLoading(false) })
    return () => { active = false }
  }, [])

  const solved = caseStats?.summary?.solvedCases ?? data.cases.filter(caseItem => caseItem.status === 'Solved').length
  const pending = caseStats?.summary?.pendingCases ?? data.cases.filter(caseItem => caseItem.status === 'Pending').length
  const avgResolution = caseStats?.summary?.averageResolutionDays ?? null
  const stationStats = caseStats?.stationStatistics ?? []

  const exportReport = async () => {
    // DNA sample/match ekhon real API theke (age mock data.samples/data.matches chilo) — Member 1 Issue 7
    // API fail korle faka list diye export hobe, jate CSV export atke na jay
    const [dnaSamples, dnaMatches] = await Promise.all([
      getSamples().catch(() => []),
      getMatches().catch(() => []),
    ])
    const top = [...dnaMatches].sort((first, second) => second.similarityPercentage - first.similarityPercentage)[0] // shob theke beshi similarity
    const analyzed = dnaSamples.filter(sample => sample.status === 'Analyzed').length
    const reportCards = [['Highest DNA similarity match', top ? `#${top.id}` : '—', top ? `${top.similarityPercentage}% similarity (${top.matchStatus})` : 'No matches'], ['Solved investigations', String(solved), 'Current records'], ['Pending investigations', String(pending), 'Across all police stations'], ['Samples analyzed', String(analyzed), `of ${dnaSamples.length} collected samples`], ['Total missing-person reports', String(data.missingPeople.length), 'Current registry']]
    const rows = [['ForenTrace Report', new Date().toLocaleDateString()], [], ['Metric', 'Value', 'Detail'], ...reportCards.map(card => [card[0], card[1], card[2]]), [], ['Cases'], ['Case ID', 'Missing Person', 'Status', 'Priority'], ...(data.cases || []).map(caseItem => [caseItem.id, caseItem.person, caseItem.status, caseItem.priority])]
    const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `forentrace-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <>
    <PageHeader title="Reports" subtitle="System statistics and reporting summaries." action={<button onClick={exportReport} className="btn btn-outline-primary">Export Report (CSV)</button>} />
    {loading && <div className="mb-3 text-secondary">Loading statistics...</div>}
    {error && <div className="mb-3 alert alert-danger">{error}</div>}
    <div className="row g-3 mb-4">
      {stationStats.length
        ? stationStats.map(st => <div key={st.stationId ?? st.station_id ?? st.stationName} className="col-md-6 col-xl"><div className="card report-card h-100"><div className="card-body"><p className="small text-secondary">{st.stationName ?? st.station_name ?? 'Station'}</p><h3>{(st.solvedCases ?? st.solved_cases ?? 0)}/{(st.totalCases ?? st.total_cases ?? 0)}</h3><small className="text-secondary">Solved / Total</small></div></div></div>)
        : <div className="col-12"><div className="alert alert-secondary">No station statistics available.</div></div>}
    </div>
    <div className="card mb-4">
      <div className="card-header bg-white"><strong>Average identification time (days)</strong></div>
      <div className="card-body"><h3>{avgResolution === null ? '—' : String(avgResolution)}</h3><small className="text-secondary">Average days between report and identification for solved cases</small></div>
    </div>
    <div className="card">
      <div className="card-header bg-white"><strong>Labs Without Technicians</strong></div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead><tr><th>Lab ID</th><th>Lab Name</th><th>City</th></tr></thead>
          <tbody>
            {labsWithoutTechniciansLoading
              ? <tr><td colSpan="3" className="text-center text-secondary py-4">Loading report...</td></tr>
              : labsWithoutTechniciansError
                ? <tr><td colSpan="3" className="text-danger py-4">{labsWithoutTechniciansError}</td></tr>
                : labsWithoutTechnicians.length
                  ? labsWithoutTechnicians.map(lab => <tr key={lab.lab_id}><td>{lab.lab_id}</td><td>{lab.lab_name}</td><td>{lab.city}</td></tr>)
                  : <tr><td colSpan="3" className="text-center text-secondary py-4">Every DNA lab has at least one technician.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </>
}

export function Profile() {
  const { user } = useAuth()
  const roleName = user.role === 'Officer' ? 'Police Officer' : user.role
  const [editingPassword, setEditingPassword] = useState(false)
  const [form, setForm] = useState({ current: '', next: '' })
  const [message, setMessage] = useState(null)
  const [savingPassword, setSavingPassword] = useState(false)

  const submitPassword = async event => {
    event.preventDefault()
    setSavingPassword(true)
    setMessage(null)

    try {
      const result = await changeOwnPassword(form.current, form.next)
      setMessage({ success: true, text: result.message || 'Password updated successfully.' })
      setForm({ current: '', next: '' })
      setEditingPassword(false)
    } catch (error) {
      setMessage({
        success: false,
        text: error.response?.data?.message || 'Password change failed.',
      })
    } finally {
      setSavingPassword(false)
    }
  }

  return <>
    <PageHeader title="My Profile" subtitle="Your authorized system account details." />
    <div className="row g-4">
      <div className="col-lg-4">
        <div className="card">
          <div className="card-body text-center py-5">
            <div className="profile-avatar">{user.initials}</div>
            <h4 className="mt-3 mb-1">{user.name}</h4>
            <p className="text-secondary mb-2">{roleName}</p>
            <StatusBadge value={user.status || 'Active'} />
          </div>
        </div>
      </div>
      <div className="col-lg-8">
        <div className="card">
          <div className="card-header bg-white"><strong>Account information</strong></div>
          <div className="card-body">
            <div className="detail-grid">
              <span>Name<b>{user.name}</b></span>
              <span>Email<b>{user.email}</b></span>
              <span>Role<b>{roleName}</b></span>
              <span>Account type<b>{user.role === 'Admin' ? 'Predefined administrator account' : 'Registered user account'}</b></span>
            </div>
            {message && <div className={`alert ${message.success ? 'alert-success' : 'alert-danger'} mt-3 mb-0`} role={message.success ? 'status' : 'alert'}>{message.text}</div>}
          </div>
          <div className="card-footer bg-white">
            {editingPassword ? (
              <form className="row g-2" onSubmit={submitPassword}>
                <div className="col-md-5">
                  <label className="form-label" htmlFor="profile-current-password">Current password</label>
                  <input id="profile-current-password" className="form-control" type="password" autoComplete="current-password" value={form.current} onChange={event => setForm({ ...form, current: event.target.value })} required />
                </div>
                <div className="col-md-5">
                  <label className="form-label" htmlFor="profile-new-password">New password</label>
                  <input id="profile-new-password" className="form-control" type="password" autoComplete="new-password" minLength={6} value={form.next} onChange={event => setForm({ ...form, next: event.target.value })} required />
                </div>
                <div className="col-md-2 d-flex align-items-end gap-2">
                  <button className="btn btn-primary" disabled={savingPassword}>{savingPassword ? 'Saving...' : 'Save'}</button>
                  <button type="button" onClick={() => { setEditingPassword(false); setForm({ current: '', next: '' }) }} className="btn btn-light">Cancel</button>
                </div>
              </form>
            ) : (
              <button onClick={() => { setMessage(null); setEditingPassword(true) }} className="btn btn-outline-primary">Change Password</button>
            )}
          </div>
        </div>
      </div>
    </div>
  </>
}
