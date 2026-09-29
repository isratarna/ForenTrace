import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MetricCard, PageHeader, StatusBadge } from '../components/Ui'
import missingPersonService from '../services/missingPersonService'
import caseService from '../services/caseService'
import dnaService from '../services/dnaService'
import SamplesTable from '../components/SamplesTable'
import MatchesList from '../components/MatchesList'
import FamilyMembersManager from '../components/FamilyMembersManager'
import { useAuth } from '../context/AuthContext'

const STATUSES = ['Missing', 'Identified']
const GENDERS = ['Female', 'Male', 'Other']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const emptyPerson = {
  firstName: '', lastName: '', gender: '', dob: '', nationalId: '', bloodGroup: '',
  height: '', weight: '', eyeColor: '', hairColor: '', photo: '', missingDate: '',
  location: '', city: '', description: '', status: 'Missing',
}

function errorMessage(error, fallback) {
  return error.response?.data?.message || fallback || 'The request could not be completed.'
}

function formatDate(val) {
  if (!val) return ''
  return String(val).split('T')[0]
}

function PersonForm({ initial = emptyPerson, onSubmit, submitLabel, onCancel }) {
  const [form, setForm] = useState({ ...emptyPerson, ...initial })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const change = event => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = async event => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try { await onSubmit(form) } catch (requestError) { setError(errorMessage(requestError)); setSaving(false) }
  }

  function FormField({ name, label, type = 'text', options, required = false }) {
    return (
      <div className="col-md-6">
        <label className="form-label" htmlFor={`mp-${name}`}>{label}</label>
        {options ? (
          <select id={`mp-${name}`} className="form-select" name={name} value={form[name] ?? ''} onChange={change} required={required}>
            <option value="">Select {label}</option>
            {options.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        ) : (
          <input id={`mp-${name}`} className="form-control" name={name} type={type}
            min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined}
            value={form[name] ?? ''} onChange={change} required={required} />
        )}
      </div>
    )
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card-header bg-white"><strong>Missing person information</strong></div>
      <div className="card-body">
        <div className="row g-3">
          <FormField name="firstName" label="First Name" required />
          <FormField name="lastName" label="Last Name" required />
          <FormField name="gender" label="Gender" options={GENDERS} />
          <FormField name="dob" label="Date of Birth" type="date" />
          <FormField name="nationalId" label="National ID" />
          <FormField name="bloodGroup" label="Blood Group" options={BLOOD_GROUPS} />
          <FormField name="height" label="Height (cm)" type="number" />
          <FormField name="weight" label="Weight (kg)" type="number" />
          <FormField name="eyeColor" label="Eye Color" />
          <FormField name="hairColor" label="Hair Color" />
          <FormField name="photo" label="Photo URL" type="url" />
          <FormField name="missingDate" label="Missing Date" type="date" required />
          <FormField name="location" label="Last Seen Location" required />
          <FormField name="city" label="City" required />
          <FormField name="status" label="Status" options={STATUSES} required />
          <div className="col-12">
            <label className="form-label" htmlFor="mp-desc">Description</label>
            <textarea id="mp-desc" className="form-control" name="description" rows="4" value={form.description ?? ''} onChange={change} />
          </div>
        </div>
      </div>
      {error && <div className="alert alert-danger mx-3 mb-0">{error}</div>}
      <div className="card-footer bg-white text-end">
        {onCancel && <button type="button" className="btn btn-light me-2" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : submitLabel}</button>
      </div>
    </form>
  )
}

export function MissingPersons() {
  const { role } = useAuth()
  const [persons, setPersons] = useState([])
  const [stats, setStats] = useState(null)
  const [byCity, setByCity] = useState([])
  const [filters, setFilters] = useState({ search: '', gender: '', city: '', status: '', from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const { search, gender, city, status, from, to } = filters

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const requestFilters = { search, gender, city, status, from, to }
        const [rows, report] = await Promise.all([
          missingPersonService.getMissingPersons(requestFilters),
          missingPersonService.getMissingPersonStatistics(),
        ])
        setPersons(rows)
        setStats(report.summary)
        setByCity(report.byCity ?? [])
        setError('')
      } catch (requestError) {
        setError(errorMessage(requestError, 'Failed to load missing persons.'))
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [search, gender, city, status, from, to])

  const updateFilter = event => setFilters({ ...filters, [event.target.name]: event.target.value })
  const cities = [...new Set(byCity.map(row => row.city).filter(Boolean))]

  const remove = async person => {
    if (!window.confirm(`Delete missing person ${person.id} — ${person.name}? This action cannot be undone.`)) return
    try {
      setDeletingId(person.id)
      setError('')
      await missingPersonService.deleteMissingPerson(person.id)
      setPersons(current => current.filter(p => p.id !== person.id))
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to delete the missing person.'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Missing Persons"
        subtitle="Live registry of reported missing individuals."
        action={role === 'Officer' ? <Link to="/missing-persons/new" className="btn btn-primary">Register person</Link> : null}
      />
      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-sm-6 col-lg-3"><MetricCard label="Total missing persons" value={stats.total_missing_persons} hint="All registered records" /></div>
          <div className="col-sm-6 col-lg-3"><MetricCard label="Currently missing" value={stats.currently_missing} hint="Open cases" tone="warning" /></div>
          <div className="col-sm-6 col-lg-3"><MetricCard label="Identified" value={stats.identified} hint="Persons found" tone="success" /></div>
          <div className="col-sm-6 col-lg-3"><MetricCard label="Cities affected" value={stats.cities_affected} hint="Unique locations" /></div>
        </div>
      )}
      {byCity.length > 0 && (
        <div className="card mb-4">
          <div className="card-header bg-white"><strong>Missing persons by city</strong></div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>City</th><th>Total</th><th>Currently Missing</th><th>Identified</th><th>Earliest Date</th><th>Latest Date</th></tr></thead>
              <tbody>
                {byCity.map(row => (
                  <tr key={row.city}>
                    <td className="fw-semibold">{row.city}</td>
                    <td>{row.total_persons}</td>
                    <td>{row.currently_missing}</td>
                    <td>{row.identified}</td>
                    <td>{formatDate(row.earliest_missing_date)}</td>
                    <td>{formatDate(row.latest_missing_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-lg-4">
              <label className="form-label">Search</label>
              <input className="form-control" name="search" value={filters.search} onChange={updateFilter} placeholder="Name, ID, national ID, city or location" />
            </div>
            {[['gender', 'Gender', GENDERS], ['city', 'City', cities], ['status', 'Status', STATUSES]].map(([name, label, values]) => (
              <div className="col-sm-4 col-lg-2" key={name}>
                <label className="form-label">{label}</label>
                <select className="form-select" name={name} value={filters[name]} onChange={updateFilter}>
                  <option value="">All {label.toLowerCase()}s</option>
                  {values.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            ))}
            <div className="col-sm-6 col-lg-2">
              <label className="form-label">Missing from</label>
              <input className="form-control" type="date" name="from" value={filters.from} onChange={updateFilter} />
            </div>
            <div className="col-sm-6 col-lg-2">
              <label className="form-label">Missing to</label>
              <input className="form-control" type="date" name="to" value={filters.to} onChange={updateFilter} />
            </div>
          </div>
        </div>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {loading ? (
        <div className="card"><div className="card-body text-center text-secondary py-4">Loading missing persons...</div></div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr><th>Photo</th><th>Person ID</th><th>Name</th><th>Gender</th><th>Missing Date</th><th>Last Seen Location</th><th>City</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {persons.map(person => (
                  <tr key={person.id}>
                    <td>
                      {person.photo ? (
                        <img src={person.photo} alt="" width="42" height="42" className="rounded object-fit-cover" />
                      ) : (
                        <span className="person-placeholder person-thumb">{person.firstName?.[0]}{person.lastName?.[0]}</span>
                      )}
                    </td>
                    <td className="fw-semibold">{person.id}</td>
                    <td>{person.firstName} {person.lastName}</td>
                    <td>{person.gender || '—'}</td>
                    <td>{person.missingDate}</td>
                    <td>{person.location || '—'}</td>
                    <td>{person.city || '—'}</td>
                    <td><StatusBadge value={person.status} /></td>
                    <td className="text-nowrap">
                      <Link className="btn btn-sm btn-outline-primary me-1" to={`/missing-persons/${person.id}`}>View</Link>
                      {role === 'Officer' && <Link className="btn btn-sm btn-outline-secondary me-1" to={`/missing-persons/${person.id}?edit=true`}>Edit</Link>}
                      {role === 'Officer' && (
                        <button type="button" className="btn btn-sm btn-outline-danger" disabled={deletingId === person.id} onClick={() => remove(person)}>
                          {deletingId === person.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!persons.length && <tr><td colSpan="9" className="text-center text-secondary py-4">No matching records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

export function MissingPersonForm() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Register Missing Person" subtitle="Record personal and disappearance information for a new report." />
      <PersonForm
        submitLabel="Register Missing Person"
        onSubmit={async person => {
          const created = await missingPersonService.createMissingPerson(person)
          navigate(`/missing-persons/${created.id}`)
        }}
      />
    </>
  )
}

export function MissingPersonDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const [params, setParams] = useSearchParams()
  const [person, setPerson] = useState(null)
  const [editing, setEditing] = useState(params.get('edit') === 'true' && role === 'Officer')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    missingPersonService.getMissingPersonById(id)
      .then(setPerson)
      .catch(requestError => setError(errorMessage(requestError, 'Failed to load the missing person.')))
  }, [id])

  // Tabbed details (Overview, Case, Family Members, DNA Samples, DNA Matches)
  const [activeTab, setActiveTab] = useState('overview')

  // Case tab state
  const [caseData, setCaseData] = useState(null)
  const [caseLoading, setCaseLoading] = useState(false)
  const [caseError, setCaseError] = useState(null)

  // DNA samples/matches state
  const [samples, setSamples] = useState([])
  const [samplesLoading, setSamplesLoading] = useState(false)
  const [samplesError, setSamplesError] = useState(null)

  const [matches, setMatches] = useState([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchesError, setMatchesError] = useState(null)

  useEffect(() => {
    if (!person?.caseId || activeTab !== 'case') return
    let mounted = true
    setCaseLoading(true)
    setCaseError(null)
    caseService.getCaseById(person.caseId)
      .then(c => { if (!mounted) return; setCaseData(c) })
      .catch(err => { if (!mounted) return; setCaseError('Failed to load case') })
      .finally(() => { if (mounted) setCaseLoading(false) })
    return () => { mounted = false }
  }, [activeTab, person?.caseId])

  useEffect(() => {
    if (!person?.id || activeTab !== 'dna-samples') return
    let mounted = true
    setSamplesLoading(true)
    setSamplesError(null)
    dnaService.getSamplesByPerson(person.id)
      .then(rows => { if (!mounted) return; setSamples(rows) })
      .catch(err => { if (!mounted) return; setSamplesError('Failed to load DNA samples') })
      .finally(() => { if (mounted) setSamplesLoading(false) })
    return () => { mounted = false }
  }, [activeTab, person?.id])

  useEffect(() => {
    if (!person?.id || activeTab !== 'dna-matches') return
    let mounted = true
    setMatchesLoading(true)
    setMatchesError(null)
    dnaService.getMatchesByPerson(person.id)
      .then(rows => { if (!mounted) return; setMatches(rows) })
      .catch(err => { if (!mounted) return; setMatchesError('Failed to load DNA matches') })
      .finally(() => { if (mounted) setMatchesLoading(false) })
    return () => { mounted = false }
  }, [activeTab, person?.id])

  if (error && !person) return <div className="alert alert-danger" role="alert">{error}</div>
  if (!person) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading missing person...</div></div>

  if (editing) {
    return (
      <>
        <PageHeader title={`Edit ${person.name}`} subtitle={`Missing Person ID: ${person.id}`} />
        <PersonForm
          initial={person}
          submitLabel="Save Changes"
          onCancel={() => { setEditing(false); setError('') }}
          onSubmit={async draft => {
            const updated = await missingPersonService.updateMissingPerson(id, draft)
            setPerson(updated)
            setEditing(false)
            setParams({}, { replace: true })
          }}
        />
      </>
    )
  }

  const details = [
    ['Person ID', person.id],
    ['Gender', person.gender],
    ['Date of birth', person.dob],
    ['National ID', person.nationalId],
    ['Blood group', person.bloodGroup],
    ['Height', person.height ? `${person.height} cm` : ''],
    ['Weight', person.weight ? `${person.weight} kg` : ''],
    ['Eye color', person.eyeColor],
    ['Hair color', person.hairColor],
    ['Missing date', person.missingDate],
    ['Last seen location', person.location],
    ['City', person.city],
    ['Status', person.status],
    ['Case file', person.hasCase ? `Case #${person.caseId}` : 'No case file'],
  ]

  const remove = async () => {
    if (!window.confirm(`Delete missing person ${person.id}? This action cannot be undone.`)) return
    try {
      setDeleting(true)
      setError('')
      await missingPersonService.deleteMissingPerson(id)
      navigate('/missing-persons', { replace: true })
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to delete the missing person.'))
      setDeleting(false)
    }
  }
  return (
    <>
      <PageHeader
        title={person.name}
        subtitle={`Missing Person ID: ${person.id}`}
      >
        {role === 'Officer' && (
          <>
            <button type="button" className="btn btn-primary me-2" onClick={() => setEditing(true)}>Edit Person</button>
            <button type="button" className="btn btn-outline-danger" disabled={deleting} onClick={remove}>{deleting ? 'Deleting...' : 'Delete Person'}</button>
          </>
        )}
      </PageHeader>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <div className="row g-4">
        <div className="col-lg-4">
          <div className="card text-center p-3">
            {person.photo ? (
              <img src={person.photo} alt={person.name} className="img-fluid rounded" />
            ) : (
              <div className="person-placeholder">{person.firstName?.[0]}{person.lastName?.[0]}</div>
            )}
            <h3 className="mt-3">{person.name}</h3>
            <p className="text-secondary mb-2">{person.gender || '—'} · {person.dob || '—'}</p>
            <StatusBadge value={person.status} />
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card">
            <div className="card-header bg-white"><strong>Complete record</strong></div>
            <div className="card-body">
              <div className="detail-grid">
                {details.map(([label, value]) => (
                  <span key={label}>{label}<b>{value || '—'}</b></span>
                ))}
              </div>
              <hr />
              <p className="mb-0"><strong>Description:</strong> {person.description || 'No description provided.'}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4">
            <div className="btn-group mb-3" role="tablist">
              <button className={`btn btn-sm ${activeTab === 'overview' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveTab('overview')}>Overview</button>
              <button className={`btn btn-sm ${activeTab === 'case' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveTab('case')}>Case</button>
              <button className={`btn btn-sm ${activeTab === 'family' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveTab('family')}>Family Members</button>
              <button className={`btn btn-sm ${activeTab === 'dna-samples' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveTab('dna-samples')}>DNA Samples</button>
              <button className={`btn btn-sm ${activeTab === 'dna-matches' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveTab('dna-matches')}>DNA Matches</button>
            </div>

            <div className="card">
              <div className="card-body">
                {activeTab === 'overview' && (
                  <div>
                    <h5 className="mb-2">Overview</h5>
                    <p className="text-secondary">Basic missing-person record and status.</p>
                    {/* reuse the details already shown above; nothing else to render */}
                  </div>
                )}

                {activeTab === 'case' && (
                  <div>
                    <h5 className="mb-2">Case</h5>
                    {caseLoading && <div className="text-secondary">Loading case...</div>}
                    {caseError && <div className="alert alert-danger">{caseError}</div>}
                    {!person.caseId && <div className="alert alert-secondary">No case linked.</div>}
                    {person.caseId && caseData && (
                      <div className="card p-3">
                        <div className="d-flex justify-content-between align-items-start"><div><strong>Case #{caseData.id}</strong><div className="text-secondary small">{caseData.reportDate} · {caseData.priority} · <StatusBadge value={caseData.status} /></div></div><div><Link to={`/cases/${caseData.id}`} className="btn btn-sm btn-outline-primary">View case</Link></div></div>
                        <p className="mt-2 mb-0">{caseData.notes || 'No notes'}</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'family' && (
                  <div>
                    <h5 className="mb-2">Family Members</h5>
                    <FamilyMembersManager personId={person.id} allowDnaRegistration={false} />
                  </div>
                )}

                {activeTab === 'dna-samples' && (
                  <div>
                    <h5 className="mb-2">DNA Samples</h5>
                    {samplesLoading && <div className="text-secondary">Loading samples...</div>}
                    {samplesError && <div className="alert alert-danger">{samplesError}</div>}
                    {!samplesLoading && !samplesError && <SamplesTable samples={samples} />}
                  </div>
                )}

                {activeTab === 'dna-matches' && (
                  <div>
                    <h5 className="mb-2">DNA Matches</h5>
                    {matchesLoading && <div className="text-secondary">Loading matches...</div>}
                    {matchesError && <div className="alert alert-danger">{matchesError}</div>}
                    {!matchesLoading && !matchesError && <MatchesList matches={matches} />}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
