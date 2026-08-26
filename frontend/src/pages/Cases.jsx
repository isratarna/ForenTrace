import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { MetricCard, PageHeader, SearchFilters, StatusBadge } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import {
  createCase,
  deleteCase,
  getCaseById,
  getCaseStatistics,
  getCases,
  updateCase,
} from '../services/caseService'
import { getMissingPersons } from '../services/missingPersonService'
import { getOfficers } from '../services/officerService'
import { getStations } from '../services/policeStationService'

const CASE_STATUSES = ['Active', 'Pending', 'Solved']
const PRIORITIES = ['High', 'Medium', 'Low']

const emptyLookups = { people: [], stations: [], officers: [] }
const emptyStatistics = {
  summary: {
    totalCases: 0,
    activeCases: 0,
    solvedCases: 0,
    pendingCases: 0,
    highPriorityCases: 0,
    averageResolutionDays: null,
  },
  stationStatistics: [],
  officerStatistics: [],
}
const asId = value => String(value ?? '')
const isPositiveId = value => Number.isInteger(Number(value)) && Number(value) > 0
const isValidDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const errorMessage = (error, fallback) => error.response?.data?.message || fallback
const personName = person => person?.name || [person?.firstName, person?.lastName].filter(Boolean).join(' ')
const personId = person => person?.id

function findById(records, id, getId = item => item.id) {
  return records.find(record => asId(getId(record)) === asId(id))
}

function caseLabel(caseFile, lookups) {
  const person = findById(lookups.people, caseFile.personId, personId)
  const station = findById(lookups.stations, caseFile.stationId)
  const officer = findById(lookups.officers, caseFile.officerId)

  return {
    person: personName(person) || `Person #${caseFile.personId}`,
    station: station?.name || `Station #${caseFile.stationId}`,
    officer: officer?.name || `Officer #${caseFile.officerId}`,
  }
}

async function loadLookups({ tolerateMissingPeople = false } = {}) {
  if (!tolerateMissingPeople) {
    const [people, stations, officers] = await Promise.all([
      getMissingPersons(),
      getStations(),
      getOfficers(),
    ])
    return { people, stations, officers, warning: '' }
  }

  const [peopleResult, stationsResult, officersResult] = await Promise.allSettled([
    getMissingPersons(),
    getStations(),
    getOfficers(),
  ])
  const failed = [peopleResult, stationsResult, officersResult].some(result => result.status === 'rejected')

  return {
    people: peopleResult.status === 'fulfilled' ? peopleResult.value : [],
    stations: stationsResult.status === 'fulfilled' ? stationsResult.value : [],
    officers: officersResult.status === 'fulfilled' ? officersResult.value : [],
    warning: failed ? 'Some related names could not be loaded; their database IDs are shown instead.' : '',
  }
}

function Input({ label, name, type = 'text', options, required = false, value, onChange, disabled = false }) {
  return (
    <div className="col-md-6">
      <label className="form-label" htmlFor={`case-${name}`}>{label}</label>
      {options ? (
        <select id={`case-${name}`} name={name} value={value} onChange={onChange} className="form-select" required={required} disabled={disabled}>
          <option value="">Select {label}</option>
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input id={`case-${name}`} name={name} type={type} value={value} onChange={onChange} className="form-control" required={required} disabled={disabled} />
      )}
    </div>
  )
}

function validateCase(values, officers, { creating = false } = {}) {
  if (creating && !isPositiveId(values.personId)) return 'Select a valid missing person.'
  if (!isPositiveId(values.stationId)) return 'Select a valid police station.'
  if (!isPositiveId(values.officerId)) return 'Select a valid investigating officer.'
  if (creating && !isValidDate(values.reportDate)) return 'Enter a valid report date.'
  if (!CASE_STATUSES.includes(values.status)) return 'Select a valid case status.'
  if (!PRIORITIES.includes(values.priority)) return 'Select a valid priority.'
  if (values.identifiedDate && !isValidDate(values.identifiedDate)) return 'Enter a valid identified date.'

  const officer = findById(officers, values.officerId)
  if (!officer || asId(officer.stationId) !== asId(values.stationId)) {
    return 'The selected officer does not belong to the selected police station.'
  }

  return ''
}

function toPayload(values, creating = false) {
  const payload = {
    stationId: Number(values.stationId),
    officerId: Number(values.officerId),
    caseStatus: values.status,
    priority: values.priority,
    identifiedDate: values.identifiedDate || null,
    caseNotes: values.notes.trim() || null,
  }

  if (creating) {
    payload.personId = Number(values.personId)
    payload.reportDate = values.reportDate
  }

  return payload
}

function CaseFields({ form, lookups, change, includeCreationFields = false }) {
  const officers = lookups.officers.filter(officer => asId(officer.stationId) === asId(form.stationId))
  return (
    <div className="row g-3">
      {includeCreationFields && <Input label="Missing Person" name="personId" required value={form.personId} onChange={change} options={lookups.people.map(person => ({ value: personId(person), label: `${personId(person)} — ${personName(person) || 'Unnamed person'}` }))} />}
      <Input label="Police Station" name="stationId" required value={form.stationId} onChange={change} options={lookups.stations.map(station => ({ value: station.id, label: station.name }))} />
      <Input label="Investigating Officer" name="officerId" required value={form.officerId} onChange={change} disabled={!form.stationId} options={officers.map(officer => ({ value: officer.id, label: officer.name }))} />
      {includeCreationFields && <Input label="Report Date" name="reportDate" type="date" required value={form.reportDate} onChange={change} />}
      <Input label="Case Status" name="status" required value={form.status} onChange={change} options={CASE_STATUSES.map(value => ({ value, label: value }))} />
      <Input label="Priority" name="priority" required value={form.priority} onChange={change} options={PRIORITIES.map(value => ({ value, label: value }))} />
      <Input label="Identified Date" name="identifiedDate" type="date" value={form.identifiedDate} onChange={change} />
      <div className="col-12">
        <label className="form-label" htmlFor="case-notes">Case Notes</label>
        <textarea id="case-notes" name="notes" value={form.notes} onChange={change} className="form-control" rows="5" />
      </div>
    </div>
  )
}

export function Cases() {
  const { role } = useAuth()
  const [cases, setCases] = useState([])
  const [statistics, setStatistics] = useState(emptyStatistics)
  const [lookups, setLookups] = useState(emptyLookups)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ priority: '', status: '' })

  const refreshCases = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [caseRows, caseStatistics, related] = await Promise.all([
        getCases(),
        getCaseStatistics(),
        loadLookups({ tolerateMissingPeople: true }),
      ])
      setCases(caseRows)
      setStatistics(caseStatistics)
      setLookups(related)
      setWarning(related.warning)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to load investigation cases.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshCases() }, [refreshCases])

  const rows = useMemo(() => cases.map(caseFile => ({ ...caseFile, ...caseLabel(caseFile, lookups) })).filter(caseFile => {
    const searchable = Object.values(caseFile).some(value => asId(value).toLowerCase().includes(query.toLowerCase()))
    return searchable && (!filters.priority || caseFile.priority === filters.priority) && (!filters.status || caseFile.status === filters.status)
  }), [cases, filters, lookups, query])

  const remove = async caseFile => {
    if (!window.confirm(`Delete case ${caseFile.id}? This action cannot be undone.`)) return
    try {
      setDeletingId(caseFile.id)
      setError('')
      await deleteCase(caseFile.id)
      await refreshCases()
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to delete the case.'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <PageHeader title="Investigation Cases" subtitle="Investigation case files associated with missing persons." action={role === 'Officer' ? <Link to="/cases/new" className="btn btn-primary">Create Case</Link> : null} />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {warning && <div className="alert alert-warning" role="alert">{warning}</div>}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-lg-4 col-xl-2"><MetricCard label="Total Cases" value={statistics.summary.totalCases} hint="All case files" /></div>
        <div className="col-sm-6 col-lg-4 col-xl-2"><MetricCard label="Active Cases" value={statistics.summary.activeCases} hint="Open investigations" /></div>
        <div className="col-sm-6 col-lg-4 col-xl-2"><MetricCard label="Pending Cases" value={statistics.summary.pendingCases} hint="Awaiting action" tone="warning" /></div>
        <div className="col-sm-6 col-lg-4 col-xl-2"><MetricCard label="Solved Cases" value={statistics.summary.solvedCases} hint="Completed investigations" tone="success" /></div>
        <div className="col-sm-6 col-lg-4 col-xl-2"><MetricCard label="High Priority" value={statistics.summary.highPriorityCases} hint="Urgent case files" tone="warning" /></div>
        <div className="col-sm-6 col-lg-4 col-xl-2"><MetricCard label="Avg. Resolution" value={statistics.summary.averageResolutionDays === null ? '—' : `${statistics.summary.averageResolutionDays} days`} hint="Solved cases with dates" tone="success" /></div>
      </div>
      <div className="card mb-4">
        <div className="card-header bg-white"><strong>Cases by police station</strong></div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead><tr><th>Police Station</th><th>Total</th><th>Active</th><th>Solved</th><th>Pending</th><th>High Priority</th><th>Earliest Case</th><th>Latest Case</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="8" className="text-center text-secondary py-4">Loading statistics...</td></tr> : statistics.stationStatistics.map(station => (
                <tr key={station.stationId}><td className="fw-semibold">{station.stationName}</td><td>{station.totalCases}</td><td>{station.activeCases}</td><td>{station.solvedCases}</td><td>{station.pendingCases}</td><td>{station.highPriorityCases}</td><td>{station.earliestCaseDate}</td><td>{station.latestCaseDate}</td></tr>
              ))}
              {!loading && !statistics.stationStatistics.length && <tr><td colSpan="8" className="text-center text-secondary py-4">No case statistics are available.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card mb-4">
        <div className="card-header bg-white"><strong>Officers handling at least 3 cases</strong></div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead><tr><th>Officer</th><th>Police Station</th><th>Total</th><th>Active</th><th>Solved</th><th>Pending</th><th>High Priority</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="7" className="text-center text-secondary py-4">Loading statistics...</td></tr> : statistics.officerStatistics.map(officer => (
                <tr key={officer.officerId}><td className="fw-semibold">{officer.officerName}</td><td>{officer.stationName}</td><td>{officer.totalCases}</td><td>{officer.activeCases}</td><td>{officer.solvedCases}</td><td>{officer.pendingCases}</td><td>{officer.highPriorityCases}</td></tr>
              ))}
              {!loading && !statistics.officerStatistics.length && <tr><td colSpan="7" className="text-center text-secondary py-4">No officers currently meet this workload threshold.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <SearchFilters onSearchChange={setQuery} onClear={() => setFilters({ priority: '', status: '' })}>
        <SelectFilter label="Priority" value={filters.priority} values={PRIORITIES} onChange={priority => setFilters(current => ({ ...current, priority }))} />
        <SelectFilter label="Status" value={filters.status} values={CASE_STATUSES} onChange={status => setFilters(current => ({ ...current, status }))} />
      </SearchFilters>
      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead><tr><th>Case ID</th><th>Missing Person</th><th>Police Station</th><th>Officer</th><th>Priority</th><th>Status</th><th>Report Date</th><th>Actions</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="8" className="text-center text-secondary py-4">Loading cases...</td></tr> : rows.map(caseFile => (
                <tr key={caseFile.id}>
                  <td className="fw-semibold">{caseFile.id}</td><td>{caseFile.person}</td><td>{caseFile.station}</td><td>{caseFile.officer}</td><td><StatusBadge value={caseFile.priority} /></td><td><StatusBadge value={caseFile.status} /></td><td>{caseFile.reportDate}</td>
                  <td className="text-nowrap">
                    <Link className="btn btn-sm btn-outline-primary me-1" to={`/cases/${caseFile.id}`}>View</Link>
                    {role === 'Officer' && <><Link className="btn btn-sm btn-outline-secondary me-1" to={`/cases/${caseFile.id}?edit=true`}>Edit</Link><button type="button" className="btn btn-sm btn-outline-danger" disabled={deletingId === caseFile.id} onClick={() => remove(caseFile)}>{deletingId === caseFile.id ? 'Deleting...' : 'Delete'}</button></>}
                  </td>
                </tr>
              ))}
              {!loading && !rows.length && <tr><td colSpan="8" className="text-center text-secondary py-4">No matching cases found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export function CaseForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [lookups, setLookups] = useState(emptyLookups)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ personId: params.get('personId') || '', stationId: '', officerId: '', reportDate: '', status: 'Active', priority: '', identifiedDate: '', notes: '' })

  useEffect(() => {
    let active = true
    loadLookups().then(result => {
      if (active) setLookups(result)
    }).catch(requestError => {
      if (active) setError(errorMessage(requestError, 'Failed to load form options.'))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const change = event => {
    const { name, value } = event.target
    setForm(current => ({ ...current, [name]: value, ...(name === 'stationId' ? { officerId: '' } : {}) }))
  }

  const submit = async event => {
    event.preventDefault()
    const validationError = validateCase(form, lookups.officers, { creating: true })
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setSaving(true)
      setError('')
      const created = await createCase(toPayload(form, true))
      navigate(`/cases/${created.id}`)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to create the case.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Create Investigation Case" subtitle="Link a missing-person report to a police station and investigating officer." />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {loading ? <div className="card"><div className="card-body text-center text-secondary py-4">Loading form options...</div></div> : (
        <form className="card" onSubmit={submit} noValidate>
          <div className="card-body"><CaseFields form={form} lookups={lookups} change={change} includeCreationFields /></div>
          <div className="card-footer bg-white text-end"><Link to="/cases" className="btn btn-light me-2">Cancel</Link><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Case'}</button></div>
        </form>
      )}
    </>
  )
}

export function CaseDetails() {
  const { id } = useParams()
  const { role } = useAuth()
  const [params, setParams] = useSearchParams()
  const [caseFile, setCaseFile] = useState(null)
  const [lookups, setLookups] = useState(emptyLookups)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const navigate = useNavigate()
  const editing = role === 'Officer' && params.get('edit') === 'true'

  const loadCase = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [record, related] = await Promise.all([
        getCaseById(id),
        loadLookups({ tolerateMissingPeople: true }),
      ])
      setCaseFile(record)
      setLookups(related)
      setWarning(related.warning)
      setDraft({ stationId: asId(record.stationId), officerId: asId(record.officerId), status: record.status, priority: record.priority, identifiedDate: record.identifiedDate || '', notes: record.notes || '' })
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to load the case.'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadCase() }, [loadCase])

  const change = event => {
    const { name, value } = event.target
    setDraft(current => ({ ...current, [name]: value, ...(name === 'stationId' ? { officerId: '' } : {}) }))
  }

  const cancelEdit = () => setParams({}, { replace: true })

  const save = async event => {
    event.preventDefault()
    const validationError = validateCase(draft, lookups.officers)
    if (validationError) {
      setError(validationError)
      return
    }
    try {
      setSaving(true)
      setError('')
      const updated = await updateCase(id, toPayload(draft))
      setCaseFile(updated)
      setDraft({ stationId: asId(updated.stationId), officerId: asId(updated.officerId), status: updated.status, priority: updated.priority, identifiedDate: updated.identifiedDate || '', notes: updated.notes || '' })
      cancelEdit()
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to update the case.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete case ${caseFile.id}? This action cannot be undone.`)) return
    try {
      setDeleting(true)
      setError('')
      await deleteCase(caseFile.id)
      navigate('/cases', { replace: true })
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to delete the case.'))
      setDeleting(false)
    }
  }

  if (loading) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading case...</div></div>
  if (!caseFile) return <div className="alert alert-danger" role="alert">{error || 'This case could not be found.'}</div>

  const labels = caseLabel(caseFile, lookups)
  return (
    <>
      <PageHeader title={`Case ${caseFile.id}`} subtitle={`Investigation for ${labels.person}`}>
        {role === 'Officer' && <>{editing ? <button type="button" className="btn btn-light" onClick={cancelEdit}>Cancel Update</button> : <Link to={`/cases/${caseFile.id}?edit=true`} className="btn btn-primary">Edit Case</Link>}<button type="button" className="btn btn-outline-danger" disabled={deleting} onClick={remove}>{deleting ? 'Deleting...' : 'Delete Case'}</button></>}
      </PageHeader>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {warning && <div className="alert alert-warning" role="alert">{warning}</div>}
      <div className="card">
        <div className="card-header bg-white"><strong>Case information</strong></div>
        <div className="card-body">
          {editing ? (
            <form onSubmit={save} noValidate>
              <CaseFields form={draft} lookups={lookups} change={change} />
              <div className="text-end mt-3"><button type="button" className="btn btn-light me-2" onClick={cancelEdit}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button></div>
            </form>
          ) : (
            <><div className="detail-grid"><span>Case ID<b>{caseFile.id}</b></span><span>Missing Person<b>{labels.person}</b></span><span>Police Station<b>{labels.station}</b></span><span>Investigating Officer<b>{labels.officer}</b></span><span>Report Date<b>{caseFile.reportDate}</b></span><span>Priority<b><StatusBadge value={caseFile.priority} /></b></span><span>Case Status<b><StatusBadge value={caseFile.status} /></b></span><span>Identified Date<b>{caseFile.identifiedDate || '—'}</b></span></div><hr /><b>Case Notes</b><p className="mb-0 mt-1">{caseFile.notes || '—'}</p></>
          )}
        </div>
      </div>
    </>
  )
}

function SelectFilter({ label, value, values, onChange }) {
  return <div className="col-md-2"><label className="form-label">{label}</label><select value={value} onChange={event => onChange(event.target.value)} className="form-select"><option value="">All {label.toLowerCase()}s</option>{values.map(item => <option key={item}>{item}</option>)}</select></div>
}
