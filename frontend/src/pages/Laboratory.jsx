import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MetricCard, PageHeader, SearchFilters, StatusBadge, TableAction } from '../components/Ui'
import { useData } from '../data/DataContext'
import { useAuth } from '../context/AuthContext'
import {
  createSample,
  deleteSample,
  getLabs,
  getLabSummary,
  getSampleById,
  getSamples,
  getTechnicians,
  updateSample,
  updateSampleAnalysis,
} from '../services/dnaService'
import { getMissingPersons } from '../services/missingPersonService'
import { getFamilyMembersByPerson } from '../services/familyMemberService'

const search = (row, query) => !query || Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase()))
const Field = ({ label, name, type = 'text', select, options = [], value, onChange, required }) => <div className="col-md-6"><label className="form-label">{label}</label>{select ? <select name={name} className="form-select" value={value} onChange={onChange} required={required}><option value="">Select {label}</option>{options.map(item => <option key={item.value ?? item} value={item.value ?? item}>{item.label ?? item}</option>)}</select> : <input name={name} type={type} className="form-control" value={value} onChange={onChange} required={required}/>}</div>
const sampleOwner = (sample, data) => sample.familyMemberId ? data.familyMembers.find(item => item.id === sample.familyMemberId)?.name || sample.person : sample.person
const technicianLab = (user, data) => user?.lab || data.technicians.find(item => item.email === user?.email || item.name === user?.name)?.lab || ''
const labCanAccessSample = (role, user, data, sample) => role !== 'Lab Technician' || sample.lab === technicianLab(user, data)

// ---------- DNA Sample module (real API — Member 1 Issue 1) ----------

const SAMPLE_STATUSES = ['Awaiting Analysis', 'In Analysis', 'Analyzed', 'Rejected'] // backend er SAMPLE_STATUSES er sathe mil
const SAMPLE_SOURCES = ['Missing Person / Evidence', 'Family Reference'] // family_id thakle Family Reference
const SAMPLE_TYPES = ['Buccal Swab', 'Blood Sample', 'Hair Strand', 'Bone Sample', 'Tissue Sample', 'Personal Belonging']
const errorMessage = (error, fallback) => error.response?.data?.message || fallback // backend er error message dekhano
const today = () => new Date().toISOString().slice(0, 10)
const emptySampleForm = { personId: '', familyId: '', labId: '', technicianId: '', sampleType: '', collectionDate: '', storageLocation: '', remarks: '' }

// Technician je status gulo set korte pare (Issue 3) — 'Awaiting Analysis' e ferot jawa lage na
const ANALYSIS_STATUSES = ['In Analysis', 'Analyzed', 'Rejected']
// Ei status e thakle sample ekhono "analyze" korar baki
const isPendingAnalysis = sample => sample.status === 'Awaiting Analysis' || sample.status === 'In Analysis'

// Sample ta kar — family reference hole family member er naam + relationship, noile missing person
const sampleProvider = sample => sample.familyMemberName ? `${sample.familyMemberName} (${sample.familyRelationship})` : sample.personName

// Form er state ke backend er payload e convert kore (faka optional id → null)
function toSamplePayload(form) {
  return {
    personId: Number(form.personId),
    familyId: form.familyId ? Number(form.familyId) : null,
    labId: Number(form.labId),
    technicianId: form.technicianId ? Number(form.technicianId) : null,
    sampleType: form.sampleType,
    collectionDate: form.collectionDate,
    storageLocation: form.storageLocation.trim() || null,
    remarks: form.remarks.trim() || null,
  }
}

// DNA sample list page — backend role onujayi already filter kore pathay
export function Samples() {
  const { role } = useAuth()
  const [params] = useSearchParams()
  const linkedPerson = params.get('personId') || '' // missing person page theke ashle shudhu tar sample
  const [samples, setSamples] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ status: '', source: '' })
  const [labSummary, setLabSummary] = useState(null) // technician er lab workload (Issue 3)
  const isTechnician = role === 'Lab Technician'

  // Backend theke sample list (+ technician hole lab summary) load kora
  const refreshSamples = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [rows, summary] = await Promise.all([
        getSamples(linkedPerson ? { person_id: linkedPerson } : {}),
        isTechnician ? getLabSummary() : Promise.resolve(null),
      ])
      setSamples(rows)
      setLabSummary(summary)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to load DNA samples.'))
    } finally {
      setLoading(false)
    }
  }, [linkedPerson, isTechnician])

  useEffect(() => { refreshSamples() }, [refreshSamples])

  // Search + dropdown filter client side e apply kora
  const rows = useMemo(() => samples.filter(item =>
    search(item, query) &&
    (!filters.status || item.status === filters.status) &&
    (!filters.source || item.source === filters.source)
  ), [samples, query, filters])

  const remove = async sample => {
    if (!window.confirm(`Delete DNA sample #${sample.id}? This action cannot be undone.`)) return
    try {
      setDeletingId(sample.id)
      setError('')
      await deleteSample(sample.id)
      await refreshSamples()
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to delete the DNA sample.'))
    } finally {
      setDeletingId(null)
    }
  }

  const canManage = role === 'Admin' || role === 'Officer' // register/edit/delete permission

  return (
    <>
      <PageHeader
        title="DNA Samples"
        subtitle={linkedPerson ? 'Samples linked to the selected missing person.' : isTechnician ? `DNA sample records assigned to ${labSummary?.labName || 'your laboratory'}.` : role === 'Officer' ? 'DNA samples for your assigned investigation cases.' : 'DNA sample collection and analysis records.'}
        action={canManage ? <Link to={`/dna-samples/new${linkedPerson ? `?personId=${linkedPerson}` : ''}`} className="btn btn-primary">Register DNA Sample</Link> : null}
      />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {/* Technician er lab queue summary card (Issue 3 — technician sample view) */}
      {labSummary && (
        <div className="row g-3 mb-4">
          <div className="col-sm-6 col-xl-3"><MetricCard label="Awaiting Analysis" value={labSummary.awaitingAnalysis} hint="Queued in your lab" tone="warning"/></div>
          <div className="col-sm-6 col-xl-3"><MetricCard label="In Analysis" value={labSummary.inAnalysis} hint="Currently being processed"/></div>
          <div className="col-sm-6 col-xl-3"><MetricCard label="Analyzed" value={labSummary.analyzed} hint="DNA profiles recorded" tone="success"/></div>
          <div className="col-sm-6 col-xl-3"><MetricCard label="Rejected" value={labSummary.rejected} hint="Unusable samples"/></div>
        </div>
      )}
      <SearchFilters onSearchChange={setQuery} onClear={() => setFilters({ status: '', source: '' })}>
        <Filter label="State" value={filters.status} values={SAMPLE_STATUSES} onChange={status => setFilters({ ...filters, status })}/>
        <Filter label="Source" value={filters.source} values={SAMPLE_SOURCES} onChange={source => setFilters({ ...filters, source })}/>
      </SearchFilters>
      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead><tr><th>Sample ID</th><th>Source</th><th>Sample Type</th><th>Person / Family</th><th>Case</th><th>Lab</th><th>Collection Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="9" className="text-center text-secondary py-4">Loading DNA samples...</td></tr>}
              {!loading && rows.map(item => (
                <tr key={item.id}>
                  <td className="fw-semibold">#{item.id}</td>
                  <td>{item.source}</td>
                  <td>{item.sampleType}</td>
                  <td>{sampleProvider(item)}{item.familyMemberName && <small className="d-block text-secondary">for {item.personName}</small>}</td>
                  <td>{item.caseId ? (role === 'Lab Technician' ? `#${item.caseId}` : <Link to={`/cases/${item.caseId}`}>#{item.caseId}</Link>) : '—'}</td>
                  <td>{item.labName || '—'}</td>
                  <td>{item.collectionDate}</td>
                  <td><StatusBadge value={item.status}/></td>
                  <td className="text-nowrap">
                    <TableAction to={`/dna-samples/${item.id}`}/>
                    {isTechnician && isPendingAnalysis(item) && <Link className="btn btn-sm btn-primary ms-1" to={`/lab/analysis/${item.id}`}>Analyze</Link>}
                    {canManage && <Link className="btn btn-sm btn-outline-secondary ms-1" to={`/dna-samples/${item.id}/edit`}>Edit</Link>}
                    {canManage && <button type="button" className="btn btn-sm btn-outline-danger ms-1" disabled={deletingId === item.id} onClick={() => remove(item)}>{deletingId === item.id ? 'Deleting...' : 'Delete'}</button>}
                  </td>
                </tr>
              ))}
              {!loading && !rows.length && <tr><td colSpan="9" className="text-center text-secondary py-4">No matching samples found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// Register + Edit dutoi ei form diye hoy (URL e :id thakle edit mode)
export function SampleForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const nav = useNavigate()
  const [params] = useSearchParams()
  // ?personId=&familyId= diye ashle (FamilyDnaPanel er "Register Sample") person + family pre-select thakbe
  const [form, setForm] = useState({ ...emptySampleForm, personId: params.get('personId') || '', familyId: params.get('familyId') || '', collectionDate: today() })
  const [lookups, setLookups] = useState({ people: [], labs: [], technicians: [] })
  const [familyMembers, setFamilyMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Dropdown er data (missing person, lab, technician) + edit mode e existing sample load
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const [people, labs, technicians, sample] = await Promise.all([
          getMissingPersons(),
          getLabs(),
          getTechnicians(),
          editing ? getSampleById(id) : Promise.resolve(null),
        ])
        if (!mounted) return
        setLookups({ people, labs, technicians })
        if (sample) {
          // Existing sample er value diye form fill kora
          setForm({
            personId: String(sample.personId),
            familyId: sample.familyId ? String(sample.familyId) : '',
            labId: sample.labId ? String(sample.labId) : '',
            technicianId: sample.technicianId ? String(sample.technicianId) : '',
            sampleType: sample.sampleType,
            collectionDate: sample.collectionDate || '',
            storageLocation: sample.storageLocation || '',
            remarks: sample.remarks || '',
          })
        }
      } catch (requestError) {
        if (mounted) setError(errorMessage(requestError, 'Failed to load the sample form.'))
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [editing, id])

  // Missing person change hole shudhu tar family member gulo load hobe
  useEffect(() => {
    if (!form.personId) { setFamilyMembers([]); return }
    let mounted = true
    getFamilyMembersByPerson(form.personId)
      .then(rows => { if (mounted) setFamilyMembers(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (mounted) setFamilyMembers([]) })
    return () => { mounted = false }
  }, [form.personId])

  const change = event => {
    const next = { ...form, [event.target.name]: event.target.value }
    if (event.target.name === 'personId') next.familyId = '' // person change hole purono family selection baad
    if (event.target.name === 'labId') next.technicianId = '' // lab change hole purono technician baad
    setForm(next)
  }

  const submit = async event => {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      const payload = toSamplePayload(form)
      const saved = editing ? await updateSample(id, payload) : await createSample(payload)
      nav(`/dna-samples/${saved.id}`)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to save the DNA sample.'))
    } finally {
      setSaving(false)
    }
  }

  // Dropdown option gulo
  const personOptions = lookups.people.map(person => ({ value: String(person.id), label: `${person.id} — ${person.name}` }))
  const familyOptions = familyMembers.map(member => ({ value: String(member.family_id), label: `${member.first_name} ${member.last_name} (${member.relationship})` }))
  const labOptions = lookups.labs.map(lab => ({ value: String(lab.lab_id), label: lab.lab_name }))
  const technicianOptions = lookups.technicians
    .filter(tech => String(tech.lab_id) === form.labId) // shudhu selected lab er technician
    .map(tech => ({ value: String(tech.technician_id), label: `${tech.first_name} ${tech.last_name} — ${tech.designation}` }))

  if (loading) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading sample form...</div></div>

  return (
    <>
      <PageHeader title={editing ? `Edit DNA Sample #${id}` : 'Register DNA Sample'} subtitle="Record the DNA provider, laboratory assignment, and collection details."/>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form className="card" onSubmit={submit}>
        <div className="card-body">
          <div className="row g-3">
            <Field label="Missing Person" name="personId" select required value={form.personId} onChange={change} options={personOptions}/>
            <div className="col-md-6">
              <label className="form-label">Family Member (reference sample)</label>
              <select name="familyId" className="form-select" value={form.familyId} onChange={change} disabled={!form.personId}>
                <option value="">None — missing person / evidence sample</option>
                {familyOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <Field label="DNA Lab" name="labId" select required value={form.labId} onChange={change} options={labOptions}/>
            <div className="col-md-6">
              <label className="form-label">Assigned Technician (optional)</label>
              <select name="technicianId" className="form-select" value={form.technicianId} onChange={change} disabled={!form.labId}>
                <option value="">Not assigned</option>
                {technicianOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <Field label="Sample Type" name="sampleType" select required value={form.sampleType} onChange={change} options={SAMPLE_TYPES.includes(form.sampleType) || !form.sampleType ? SAMPLE_TYPES : [form.sampleType, ...SAMPLE_TYPES]}/>
            <Field label="Collection Date" name="collectionDate" type="date" required value={form.collectionDate} onChange={change}/>
            <Field label="Storage Location" name="storageLocation" value={form.storageLocation} onChange={change}/>
            <div className="col-12"><label className="form-label">Collection Remarks</label><textarea name="remarks" value={form.remarks} onChange={change} className="form-control" rows="4"/></div>
          </div>
        </div>
        <div className="card-footer bg-white text-end">
          <Link to={editing ? `/dna-samples/${id}` : '/dna-samples'} className="btn btn-light me-2">Cancel</Link>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Save DNA Sample'}</button>
        </div>
      </form>
    </>
  )
}

// Ekta sample er details page — backend scope er baire hole 404 dey
export function SampleDetails() {
  const { id } = useParams()
  const { role } = useAuth()
  const nav = useNavigate()
  const [sample, setSample] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getSampleById(id)
      .then(row => { if (mounted) setSample(row) })
      .catch(requestError => { if (mounted) setError(errorMessage(requestError, 'Failed to load the DNA sample.')) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [id])

  const remove = async () => {
    if (!window.confirm(`Delete DNA sample #${sample.id}? This action cannot be undone.`)) return
    try {
      await deleteSample(sample.id)
      nav('/dna-samples')
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to delete the DNA sample.'))
    }
  }

  if (loading) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading DNA sample...</div></div>
  if (!sample) return <div className="alert alert-warning">{error || 'This DNA sample could not be found.'}</div>

  const canManage = role === 'Admin' || role === 'Officer'
  const isTechnician = role === 'Lab Technician' // technician investigation page e link pabe na

  return (
    <>
      <PageHeader
        title={`DNA Sample #${sample.id}`}
        subtitle="DNA sample record"
        action={<>
          {/* Pending hole "Analyze", already analyzed/rejected hole correction er jonno "Update Analysis" */}
          {isTechnician && <Link className="btn btn-primary" to={`/lab/analysis/${sample.id}`}>{isPendingAnalysis(sample) ? 'Analyze Sample' : 'Update Analysis'}</Link>}
          {canManage && <Link className="btn btn-outline-secondary" to={`/dna-samples/${sample.id}/edit`}>Edit</Link>}
          {canManage && <button type="button" className="btn btn-outline-danger" onClick={remove}>Delete</button>}
        </>}
      />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="row g-4">
        <div className="col-lg-6">
          <Card title="Collection and relationship information">
            <div className="detail-grid">
              <span>DNA source<b>{sample.source}</b></span>
              <span>Sample type<b>{sample.sampleType}</b></span>
              <span>Provider / owner<b>{sampleProvider(sample)}</b></span>
              <span>Missing person<b>{isTechnician ? sample.personName : <Link to={`/missing-persons/${sample.personId}`}>{sample.personName}</Link>}</b></span>
              <span>Family member<b>{sample.familyMemberName ? `${sample.familyMemberName} (${sample.familyRelationship})` : '—'}</b></span>
              <span>Related case<b>{sample.caseId ? (isTechnician ? `#${sample.caseId}` : <Link to={`/cases/${sample.caseId}`}>#{sample.caseId}</Link>) : '—'}</b></span>
              <span>Collection date<b>{sample.collectionDate}</b></span>
              <span>Storage location<b>{sample.storageLocation || '—'}</b></span>
              <span>Assigned laboratory<b>{sample.labName || '—'}</b></span>
              <span>Assigned technician<b>{sample.technicianName || '—'}</b></span>
            </div>
          </Card>
        </div>
        <div className="col-lg-6">
          <Card title="Analysis information">
            <div className="d-flex justify-content-between mb-3"><span>Current state</span><StatusBadge value={sample.status}/></div>
            <div className="detail-grid">
              <span>Analysis date<b>{sample.analysisDate || '—'}</b></span>
              <span>DNA profile code<b>{sample.dnaProfileCode || '—'}</b></span>
            </div>
            <hr/>
            <b>Remarks</b>
            <p className="mb-0 mt-1">{sample.remarks || '—'}</p>
          </Card>
        </div>
      </div>
    </>
  )
}

// Lab Sample Analysis page (Member 1 - Issue 3)
// Technician shudhu analysis info (status, analysis date, DNA profile code, laboratory remarks) update kore
// Collection/investigation info read-only — backend o egulo pathale reject kore
export function DNAAnalysis() {
  const { id } = useParams()
  const nav = useNavigate()
  const [sample, setSample] = useState(null)
  const [form, setForm] = useState({ status: 'Analyzed', analysisDate: today(), dnaProfileCode: '', remarks: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Sample load — onno lab er sample hole backend 404 dey
  useEffect(() => {
    let mounted = true
    getSampleById(id)
      .then(row => {
        if (!mounted) return
        setSample(row)
        // Age theke analysis info thakle sheta diye form fill (correction er jonno)
        setForm({
          status: ANALYSIS_STATUSES.includes(row.status) ? row.status : 'Analyzed',
          analysisDate: row.analysisDate || today(),
          dnaProfileCode: row.dnaProfileCode || '',
          remarks: row.remarks || '',
        })
      })
      .catch(requestError => { if (mounted) setError(errorMessage(requestError, 'Failed to load the DNA sample.')) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [id])

  const change = event => setForm({ ...form, [event.target.name]: event.target.value })

  const submit = async event => {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      // Shudhu 4 ta analysis field pathano hocche — investigation field kokhono na
      await updateSampleAnalysis(id, {
        status: form.status,
        analysisDate: form.analysisDate || null,
        dnaProfileCode: form.dnaProfileCode.trim() || null,
        remarks: form.remarks.trim() || null,
      })
      nav(`/dna-samples/${id}`)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to save the analysis.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card"><div className="card-body text-center text-secondary py-4">Loading DNA sample...</div></div>
  if (!sample) return <div className="alert alert-warning">{error || 'This DNA sample could not be found.'}</div>

  const needsProfile = form.status === 'Analyzed' // Analyzed hole profile code + date lagbe
  const needsRemarks = form.status === 'Rejected' // Rejected hole karon lagbe

  return (
    <>
      <PageHeader title={`Analyze Sample #${sample.id}`} subtitle="Record the laboratory analysis for this sample. Collection data remains read-only."/>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="row g-4">
        <div className="col-lg-4">
          {/* Read-only collection info — technician edit korte parbe na */}
          <Card title="Sample information (read-only)">
            <p><span className="text-secondary d-block small">Source / provider</span>{sample.source} — {sampleProvider(sample)}</p>
            <p><span className="text-secondary d-block small">Sample type</span>{sample.sampleType}</p>
            <p><span className="text-secondary d-block small">Collection date</span>{sample.collectionDate}</p>
            <p><span className="text-secondary d-block small">Storage location</span>{sample.storageLocation || '—'}</p>
            <p><span className="text-secondary d-block small">Assigned lab / technician</span>{sample.labName || '—'} / {sample.technicianName || 'Not assigned'}</p>
            <p className="mb-0"><span className="text-secondary d-block small">Current status</span><StatusBadge value={sample.status}/></p>
          </Card>
        </div>
        <div className="col-lg-8">
          <form className="card" onSubmit={submit}>
            <div className="card-header bg-white"><strong>Analysis information</strong></div>
            <div className="card-body">
              <div className="row g-3">
                <Field label="Analysis Status" name="status" select required value={form.status} onChange={change} options={ANALYSIS_STATUSES}/>
                <Field label="Analysis Date" name="analysisDate" type="date" required={needsProfile} value={form.analysisDate} onChange={change}/>
                <div className="col-md-6">
                  <label className="form-label">DNA Profile Code</label>
                  <input name="dnaProfileCode" className="form-control text-uppercase" value={form.dnaProfileCode} onChange={change} required={needsProfile} placeholder="e.g. DNA7F2A91C4" pattern="[A-Za-z0-9\-]{6,50}" title="6-50 letters, numbers, or hyphens"/>
                  <small className="text-secondary">Required when the status is Analyzed.</small>
                </div>
                <div className="col-12">
                  <label className="form-label">Laboratory Remarks</label>
                  <textarea name="remarks" value={form.remarks} onChange={change} className="form-control" rows="5" required={needsRemarks} placeholder={needsRemarks ? 'Reason for rejecting the sample' : 'Extraction method, quality notes, etc.'}/>
                </div>
              </div>
            </div>
            <div className="card-footer bg-white text-end">
              <Link to={`/dna-samples/${sample.id}`} className="btn btn-light me-2">Cancel</Link>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Analysis'}</button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export function Matches() {
  const { data } = useData(); const { role, user } = useAuth(); const [params] = useSearchParams(); const linkedPerson = params.get('personId'); const [query, setQuery] = useState(''); const [filters, setFilters] = useState({ confidence: '', status: '' }); const personSamples = linkedPerson ? data.samples.filter(item => item.personId === linkedPerson).map(item => item.id) : []; const assignedLab = technicianLab(user, data); const rows = data.matches.filter(item => (!linkedPerson || personSamples.includes(item.unknown) || personSamples.includes(item.matched)) && (role !== 'Lab Technician' || item.lab === assignedLab) && search(item, query) && (!filters.confidence || item.confidence === filters.confidence) && (!filters.status || item.status === filters.status)); return <><PageHeader title="DNA Matches" subtitle={linkedPerson ? 'DNA comparison results tied to the selected missing person.' : 'DNA profile comparison results for authorized investigation review.'}/><SearchFilters onSearchChange={setQuery} onClear={() => setFilters({ confidence: '', status: '' })}><Filter label="Confidence" value={filters.confidence} values={['High', 'Medium', 'Low']} onChange={confidence => setFilters({ ...filters, confidence })}/><Filter label="Status" value={filters.status} values={['Pending Review', 'Reviewed']} onChange={status => setFilters({ ...filters, status })}/></SearchFilters><div className="card"><div className="table-responsive"><table className="table table-hover mb-0"><thead><tr><th>Match ID</th><th>Sample A / Provider</th><th>Sample B / Provider</th><th>Similarity</th><th>Confidence</th><th>Match Date</th><th>Status</th><th/></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td className="fw-semibold">{item.id}</td><td>{describeSample(item.unknown, data)}</td><td>{describeSample(item.matched, data)}</td><td className="fw-bold">{item.similarity}</td><td><StatusBadge value={item.confidence}/></td><td>{item.date}</td><td><StatusBadge value={item.status}/></td><td><TableAction to={`/dna-matches/${item.id}`}/></td></tr>)}{!rows.length && <tr><td colSpan="8" className="text-center text-secondary py-4">No matching DNA comparisons found.</td></tr>}</tbody></table></div></div></>
}

export function MatchDetails() {
  const { id } = useParams(); const { data, updateMatch } = useData(); const { role, user } = useAuth(); const match = data.matches.find(item => item.id === id); if (!match) return <NotFound label="DNA match"/>; if (role === 'Lab Technician' && match.lab !== technicianLab(user, data)) return <AccessDenied/>; const first = data.samples.find(item => item.id === match.unknown); const second = data.samples.find(item => item.id === match.matched); const canReview = role === 'Officer' || role === 'Lab Technician'; const canOpenSample = sample => sample && labCanAccessSample(role, user, data, sample)
  return <><PageHeader title={match.id} subtitle="DNA match comparison result" action={canReview && match.status !== 'Reviewed' ? <button onClick={() => updateMatch(match.id, { status: 'Reviewed' })} className="btn btn-primary">Mark as Reviewed</button> : null}/><div className="match-hero card mb-4"><div className="card-body"><div><span className="eyebrow">SAMPLE A</span><h3>{match.unknown}</h3><small>{describeSample(match.unknown, data)}</small></div><div className="match-score"><b>{match.similarity}</b><span>Similarity</span><StatusBadge value={`${match.confidence} Confidence`}/></div><div className="text-lg-end"><span className="eyebrow">SAMPLE B</span><h3>{match.matched}</h3><small>{describeSample(match.matched, data)}</small></div></div></div><div className="row g-4"><div className="col-md-6"><Card title="Compared samples"><p>Sample A: {canOpenSample(first) ? <Link to={`/dna-samples/${first.id}`}>{first.id}</Link> : match.unknown} <b>— {first ? sampleOwner(first, data) : 'record unavailable'}</b></p><p className="mb-0">Sample B: {canOpenSample(second) ? <Link to={`/dna-samples/${second.id}`}>{second.id}</Link> : match.matched} <b>— {second ? sampleOwner(second, data) : 'record unavailable'}</b></p></Card></div><div className="col-md-6"><Card title="Match record"><p>Match date: <b>{match.date}</b></p><p>Confidence: <StatusBadge value={match.confidence}/></p><p className="mb-0">Status: <StatusBadge value={match.status}/></p></Card></div></div></>
}

function describeSample(id, data) { const sample = data.samples.find(item => item.id === id); return sample ? `${sample.id} — ${sampleOwner(sample, data)}` : `${id} — unavailable sample record` }
function Filter({ label, value, values, onChange }) { return <div className="col-md-2"><label className="form-label">{label}</label><select className="form-select" value={value} onChange={event => onChange(event.target.value)}><option value="">All {label.toLowerCase()}s</option>{values.map(item => <option key={item}>{item}</option>)}</select></div> }
function Card({ title, children }) { return <div className="card h-100"><div className="card-header bg-white"><strong>{title}</strong></div><div className="card-body">{children}</div></div> }
function NotFound({ label }) { return <div className="alert alert-warning">This {label} could not be found.</div> }
function AccessDenied() { return <div className="alert alert-danger">You are not authorized to access this laboratory record.</div> }
