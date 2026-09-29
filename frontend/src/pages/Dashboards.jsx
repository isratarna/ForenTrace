import { Link } from 'react-router-dom'
import { MetricCard, PageHeader, StatusBadge } from '../components/Ui'
import { useData } from '../data/DataContext'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import caseService from '../services/caseService'
import adminStatsService from '../services/adminStatsService'

export function Dashboard({ type }) {
  const { data } = useData()
  const { user } = useAuth()
  // Admin: fetch aggregated counts and case summary
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState(null)
  const [adminCounts, setAdminCounts] = useState(null)
  const [caseSummary, setCaseSummary] = useState(null)

  const fetchAdminData = async () => {
    setAdminLoading(true)
    setAdminError(null)
    try {
      const [caseStats, counts] = await Promise.all([
        caseService.getCaseStatistics(),
        adminStatsService.getAdminCounts(),
      ])
      // Temporary logs to verify API response field names (remove after verification)
      console.log('CASE_STATS_RESPONSE', caseStats)
      console.log('ADMIN_COUNTS_RESPONSE', counts)
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
  const assignedLab = user?.lab || data.technicians.find(technician => technician.email === user?.email || technician.name === user?.name)?.lab || ''
  const scopedCases = type === 'Officer' ? data.cases.filter(caseItem => caseItem.officer === user?.name) : data.cases
  const scopedSamples = type === 'Lab Technician' ? data.samples.filter(sample => sample.lab === assignedLab) : type === 'Officer' ? data.samples.filter(sample => scopedCases.some(caseItem => caseItem.id === sample.caseId)) : data.samples
  const scopedMatches = type === 'Lab Technician' ? data.matches.filter(match => match.lab === assignedLab) : type === 'Officer' ? data.matches.filter(match => scopedSamples.some(sample => sample.id === match.unknown || sample.id === match.matched)) : data.matches
  const activeCases = scopedCases.filter(caseItem => caseItem.status === 'Active')
  const awaiting = scopedSamples.filter(sample => sample.status === 'Awaiting Analysis')
  const reviewed = scopedMatches.filter(match => match.status === 'Reviewed')
  const high = scopedMatches.filter(match => match.confidence === 'High')
    const cards = type === 'Lab Technician' ? [['Awaiting Analysis', awaiting.length, 'Samples queued for laboratory work'], ['Analyzed Samples', scopedSamples.filter(sample => sample.status === 'Analyzed').length, 'Profiles recorded'], ['DNA Matches', scopedMatches.length, 'Comparison records'], ['High-confidence Matches', high.length, 'Investigation review required']] : type === 'Officer' ? [['My Active Cases', activeCases.length, 'Currently active investigations'], ['Pending Cases', scopedCases.filter(caseItem => caseItem.status === 'Pending').length, 'Awaiting evidence or action'], ['Samples Awaiting Results', awaiting.length, 'Assigned to laboratory'], ['New DNA Matches', scopedMatches.filter(match => match.status === 'Pending Review').length, 'Awaiting review']] : [['Missing Persons', data.missingPeople.length, 'Current registry'], ['Active Cases', activeCases.length, 'Open investigations'], ['DNA Samples', data.samples.length, 'Collection records'], ['High-confidence Matches', high.length, 'DNA comparison results']]

    const adminCards = [
      ['Solved Cases', caseSummary ? caseSummary.solvedCases : (adminLoading ? 'Loading...' : '—'), 'Investigations marked solved'],
      ['Pending Cases', caseSummary ? caseSummary.pendingCases : (adminLoading ? 'Loading...' : '—'), 'Investigations awaiting action'],
      ['Samples Awaiting Analysis', adminCounts ? (adminCounts.samplesAwaitingAnalysis === null ? '—' : adminCounts.samplesAwaitingAnalysis) : (adminLoading ? 'Loading...' : '—'), 'Samples queued for lab analysis'],
      ['Police Stations', adminCounts ? adminCounts.policeStationCount : (adminLoading ? 'Loading...' : '—'), 'Registered stations'],
      ['DNA Labs', adminCounts ? adminCounts.dnaLabCount : (adminLoading ? 'Loading...' : '—'), 'Registered DNA laboratories'],
    ]
  const activity = type === 'Lab Technician' ? awaiting.map(sample => [sample.id, sample.person, '—', sample.status, `/dna-samples/${sample.id}`]) : scopedCases.slice(0, 6).map(caseItem => [caseItem.id, caseItem.person, caseItem.priority, caseItem.status, `/cases/${caseItem.id}`])

  // Render Admin dashboard with API-driven cards
  if (type === 'Admin') {
    return <>
      <PageHeader title="Admin Dashboard" subtitle="System-wide statistics and operational metrics." action={null}/>
      {adminLoading && <div className="mb-3 text-secondary">Loading dashboard...</div>}
      {adminError && <div className="mb-3 alert alert-danger d-flex justify-content-between align-items-center"><span>{adminError}</span><button onClick={fetchAdminData} className="btn btn-sm btn-outline-light">Retry</button></div>}
      <div className="row g-3 mb-4">{adminCards.map((card, index) => <div className="col-sm-6 col-xl-3" key={card[0]}><MetricCard label={card[0]} value={card[1]} hint={card[2]} tone={index === 4 ? 'primary' : index === 1 ? 'warning' : 'primary'}/></div>)}</div>
    </>
  }

  // Non-admin (Officer / Lab Technician) — keep existing mock-driven UI
  return <>
    <PageHeader title={`${type === 'Lab Technician' ? 'Laboratory' : type} Dashboard`} subtitle={type === 'Officer' ? 'Your investigation workload and linked DNA identification updates.' : type === 'Lab Technician' ? `Laboratory work assigned to ${assignedLab || 'your lab'}.` : 'Forensic investigation overview.'} action={type === 'Officer' ? <Link to="/missing-persons/new" className="btn btn-primary">Register Missing Person</Link> : null}/>
    <div className="row g-3 mb-4">{cards.map((card, index) => <div className="col-sm-6 col-xl-3" key={card[0]}><MetricCard label={card[0]} value={card[1]} hint={card[2]} tone={index === 3 ? 'success' : index === 1 ? 'warning' : 'primary'}/></div>)}</div>
    <div className="row g-4">
      <div className="col-lg-7">
        <div className="card h-100">
          <div className="card-header bg-white d-flex justify-content-between"><strong>{type === 'Lab Technician' ? 'Samples requiring attention' : 'Recent investigation activity'}</strong><Link to={type === 'Lab Technician' ? '/dna-samples' : '/cases'}>View all</Link></div>
          <div className="table-responsive"><table className="table table-hover mb-0"><thead><tr><th>Record</th><th>Subject</th><th>Priority</th><th>Status</th></tr></thead><tbody>{activity.map(row => <tr key={row[0]}><td className="fw-semibold"><Link to={row[4]}>{row[0]}</Link></td><td>{row[1]}</td><td>{row[2] !== '—' && <StatusBadge value={row[2]}/>}</td><td><StatusBadge value={row[3]}/></td></tr>)}{!activity.length && <tr><td colSpan="4" className="text-center text-secondary py-4">No records need attention.</td></tr>}</tbody></table></div>
        </div>
      </div>
      <div className="col-lg-5">
        <div className="card h-100">
          <div className="card-header bg-white"><strong>{type === 'Officer' ? 'Investigation summary' : 'DNA result summary'}</strong></div>
          <div className="card-body">{type === 'Officer' ? <><p className="mb-2"><b>{high.length}</b> high-confidence DNA matches are available across your linked investigations.</p><p className="mb-0 text-secondary small">{awaiting.length} evidence and reference samples are still awaiting analysis.</p></> : <><p className="mb-2"><b>{reviewed.length}</b> DNA comparisons have been reviewed.</p><p className="mb-0 text-secondary small">{high.length} comparison results are marked high confidence.</p></>}</div>
        </div>
      </div>
    </div>
  </>
}
