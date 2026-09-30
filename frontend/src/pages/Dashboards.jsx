import { Link } from 'react-router-dom'
import { MetricCard, PageHeader, StatusBadge } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import caseService from '../services/caseService'
import adminStatsService from '../services/adminStatsService'
import { getLabSummary, getMatches, getSamples } from '../services/dnaService' // real DNA data (Member 1 - Issue 7)

// Ei status e thakle sample er analysis ekhono baki
const isPendingAnalysis = sample => sample.status === 'Awaiting Analysis' || sample.status === 'In Analysis'

export function Dashboard({ type }) {
  const { user } = useAuth()
  // Admin: fetch aggregated counts and case summary
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState(null)
  const [adminCounts, setAdminCounts] = useState(null)
  const [caseSummary, setCaseSummary] = useState(null)

  // Officer / Lab Technician: real API data (age mock DataContext theke ashto — Member 1 Issue 7)
  const [roleData, setRoleData] = useState({ cases: [], samples: [], matches: [], labSummary: null })
  const [roleLoading, setRoleLoading] = useState(false)
  const [roleError, setRoleError] = useState(null)

  const fetchAdminData = async () => {
    setAdminLoading(true)
    setAdminError(null)
    try {
      const [caseStats, counts] = await Promise.all([
        caseService.getCaseStatistics(),
        adminStatsService.getAdminCounts(),
      ])

      setCaseSummary(caseStats.summary || null)
      setAdminCounts(counts || null)
    } catch (err) {
      console.error('Failed to load admin dashboard data', err)
      setAdminError(err.response?.data?.message || 'Failed to load admin dashboard data')
    } finally {
      setAdminLoading(false)
    }
  }

  useEffect(() => {
    if (type !== 'Admin') return
    let mounted = true
    // fetchAdminData handles mounted check implicitly; keep this safe for unmount
    fetchAdminData()
    return () => { mounted = false }
  }, [type])

  // Officer / Lab Technician dashboard er data load
  // DNA sample/match API backend e-i role onujayi scoped (officer = nijer case, technician = nijer lab)
  useEffect(() => {
    if (type !== 'Officer' && type !== 'Lab Technician') return
    let mounted = true
    setRoleLoading(true)
    setRoleError(null)
    Promise.all([
      getSamples(),
      getMatches(),
      type === 'Officer' ? caseService.getCases() : Promise.resolve([]),
      type === 'Lab Technician' ? getLabSummary() : Promise.resolve(null),
    ])
      .then(([samples, matches, cases, labSummary]) => {
        if (!mounted) return
        // Case API ekhono officer-scoped na, tai ekhane nijer officerId diye filter
        const myCases = cases.filter(caseItem => String(caseItem.officerId) === String(user?.officerId))
        setRoleData({ samples, matches, cases: myCases, labSummary })
      })
      .catch(err => {
        console.error('Failed to load dashboard data', err)
        if (mounted) setRoleError(err.response?.data?.message || 'Failed to load dashboard data')
      })
      .finally(() => { if (mounted) setRoleLoading(false) })
    return () => { mounted = false }
  }, [type, user?.officerId])

  const { cases, samples, matches, labSummary } = roleData
  const activeCases = cases.filter(caseItem => caseItem.status === 'Active')
  const pendingSamples = samples.filter(isPendingAnalysis) // Awaiting + In Analysis
  const reviewed = matches.filter(match => match.matchStatus === 'Confirmed' || match.matchStatus === 'Rejected')
  const high = matches.filter(match => match.confidenceLevel === 'High')
  const loadingValue = value => (roleLoading ? '…' : value)

  // Role onujayi card: [label, value, hint]
  const cards = type === 'Lab Technician'
    ? [
      ['Awaiting Analysis', loadingValue(labSummary?.awaitingAnalysis ?? 0), 'Samples queued for laboratory work'],
      ['Analyzed Samples', loadingValue(labSummary?.analyzed ?? 0), 'Profiles recorded'],
      ['DNA Matches', loadingValue(matches.length), 'Comparison records'],
      ['High-confidence Matches', loadingValue(high.length), 'Investigation review required'],
    ]
    : [
      ['My Active Cases', loadingValue(activeCases.length), 'Currently active investigations'],
      ['Pending Cases', loadingValue(cases.filter(caseItem => caseItem.status === 'Pending').length), 'Awaiting evidence or action'],
      ['Samples Awaiting Results', loadingValue(pendingSamples.length), 'Assigned to laboratory'],
      ['New DNA Matches', loadingValue(matches.filter(match => match.matchStatus === 'Pending Review').length), 'Awaiting review'],
    ]

    const adminCards = [
      ['Solved Cases', caseSummary ? caseSummary.solvedCases : (adminLoading ? 'Loading...' : '—'), 'Investigations marked solved'],
      ['Pending Cases', caseSummary ? caseSummary.pendingCases : (adminLoading ? 'Loading...' : '—'), 'Investigations awaiting action'],
      ['Samples Awaiting Analysis', adminCounts ? (adminCounts.samplesAwaitingAnalysis === null ? '—' : adminCounts.samplesAwaitingAnalysis) : (adminLoading ? 'Loading...' : '—'), 'Samples queued for lab analysis'],
      ['Police Stations', adminCounts ? adminCounts.policeStationCount : (adminLoading ? 'Loading...' : '—'), 'Registered stations'],
      ['DNA Labs', adminCounts ? adminCounts.dnaLabCount : (adminLoading ? 'Loading...' : '—'), 'Registered DNA laboratories'],
    ]

  // Table row: [record, subject, third column, status, link]
  // Technician: analysis baki sample (third = sample type), Officer: nijer recent case (third = priority)
  const activity = type === 'Lab Technician'
    ? pendingSamples.map(sample => [`#${sample.id}`, sample.familyMemberName ? `${sample.familyMemberName} (${sample.familyRelationship})` : sample.personName, sample.sampleType, sample.status, `/dna-samples/${sample.id}`])
    : cases.slice(0, 6).map(caseItem => [`#${caseItem.id}`, caseItem.missingPersonName || `Person #${caseItem.personId}`, caseItem.priority, caseItem.status, `/cases/${caseItem.id}`])

  // Render Admin dashboard with API-driven cards
  if (type === 'Admin') {
    return <>
      <PageHeader title="Admin Dashboard" subtitle="System-wide statistics and operational metrics." action={null}/>
      {adminLoading && <div className="mb-3 text-secondary">Loading dashboard...</div>}
      {adminError && <div className="mb-3 alert alert-danger d-flex justify-content-between align-items-center"><span>{adminError}</span><button onClick={fetchAdminData} className="btn btn-sm btn-outline-light">Retry</button></div>}
      <div className="row g-3 mb-4">{adminCards.map((card, index) => <div className="col-sm-6 col-xl-3" key={card[0]}><MetricCard label={card[0]} value={card[1]} hint={card[2]} tone={index === 4 ? 'primary' : index === 1 ? 'warning' : 'primary'}/></div>)}</div>
    </>
  }

  // Non-admin (Officer / Lab Technician) — real API data diye (Member 1 - Issue 7)
  const isTechnician = type === 'Lab Technician'
  return <>
    <PageHeader title={`${isTechnician ? 'Laboratory' : type} Dashboard`} subtitle={type === 'Officer' ? 'Your investigation workload and linked DNA identification updates.' : `Laboratory work assigned to ${labSummary?.labName || 'your lab'}.`} action={type === 'Officer' ? <Link to="/missing-persons/new" className="btn btn-primary">Register Missing Person</Link> : null}/>
    {roleError && <div className="mb-3 alert alert-danger">{roleError}</div>}
    <div className="row g-3 mb-4">{cards.map((card, index) => <div className="col-sm-6 col-xl-3" key={card[0]}><MetricCard label={card[0]} value={card[1]} hint={card[2]} tone={index === 3 ? 'success' : index === 1 ? 'warning' : 'primary'}/></div>)}</div>
    <div className="row g-4">
      <div className="col-lg-7">
        <div className="card h-100">
          <div className="card-header bg-white d-flex justify-content-between"><strong>{isTechnician ? 'Samples requiring attention' : 'Recent investigation activity'}</strong><Link to={isTechnician ? '/dna-samples' : '/cases'}>View all</Link></div>
          <div className="table-responsive"><table className="table table-hover mb-0"><thead><tr><th>Record</th><th>Subject</th><th>{isTechnician ? 'Sample Type' : 'Priority'}</th><th>Status</th></tr></thead><tbody>
            {roleLoading && <tr><td colSpan="4" className="text-center text-secondary py-4">Loading...</td></tr>}
            {!roleLoading && activity.map(row => <tr key={row[0]}><td className="fw-semibold"><Link to={row[4]}>{row[0]}</Link></td><td>{row[1]}</td><td>{isTechnician ? row[2] : row[2] && <StatusBadge value={row[2]}/>}</td><td><StatusBadge value={row[3]}/></td></tr>)}
            {!roleLoading && !activity.length && <tr><td colSpan="4" className="text-center text-secondary py-4">No records need attention.</td></tr>}
          </tbody></table></div>
        </div>
      </div>
      <div className="col-lg-5">
        <div className="card h-100">
          <div className="card-header bg-white"><strong>{type === 'Officer' ? 'Investigation summary' : 'DNA result summary'}</strong></div>
          <div className="card-body">{type === 'Officer' ? <><p className="mb-2"><b>{high.length}</b> high-confidence DNA matches are available across your linked investigations.</p><p className="mb-0 text-secondary small">{pendingSamples.length} evidence and reference samples are still awaiting analysis.</p></> : <><p className="mb-2"><b>{reviewed.length}</b> DNA comparisons have been reviewed.</p><p className="mb-0 text-secondary small">{high.length} comparison results are marked high confidence.</p></>}</div>
        </div>
      </div>
    </div>
  </>
}
