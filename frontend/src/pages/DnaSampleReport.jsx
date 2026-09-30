import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MetricCard, PageHeader, StatusBadge } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { getSampleOverviewReport } from '../services/dnaService'

const REPORT_STATUSES = ['Matched', 'Awaiting Match']

// DNA Sample Overview Report (Member 1 - Issue 6)
// Backend e SQL UNION: Part 1 'Matched' (Confirmed match e ache) + Part 2 'Awaiting Match' (analyzed, confirmed match nai)
export default function DnaSampleReport() {
  const { role } = useAuth()
  const [data, setData] = useState({ summary: null, report: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    let active = true
    getSampleOverviewReport()
      .then(result => { if (active) setData(result) })
      .catch(requestError => { if (active) setError(requestError.response?.data?.message || 'Failed to load the DNA sample report.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Report status diye client side filter
  const rows = useMemo(
    () => data.report.filter(item => !statusFilter || item.reportStatus === statusFilter),
    [data.report, statusFilter]
  )

  const isTechnician = role === 'Lab Technician' // technician investigation (person) page e link pabe na

  return (
    <>
      <PageHeader
        title="DNA Sample Overview Report"
        subtitle="Combined report (SQL UNION) of samples with confirmed matches and analyzed samples still waiting for a match."
      />

      {loading && <div className="card"><div className="card-body text-center text-secondary py-4">Loading report...</div></div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && data.summary && (
        <>
          {/* UNION er duita part er count */}
          <div className="row g-3 mb-4">
            <div className="col-sm-4"><MetricCard label="Matched" value={data.summary.matched} hint="Samples in a confirmed DNA match" tone="success"/></div>
            <div className="col-sm-4"><MetricCard label="Awaiting Match" value={data.summary.awaitingMatch} hint="Analyzed, no confirmed match yet" tone="warning"/></div>
            <div className="col-sm-4"><MetricCard label="Total in Report" value={data.summary.total} hint="Rows returned by the UNION"/></div>
          </div>

          <div className="card mb-3">
            <div className="card-body d-flex flex-wrap align-items-end gap-3">
              <div>
                <label className="form-label" htmlFor="report-status">Report status</label>
                <select id="report-status" className="form-select" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {REPORT_STATUSES.map(status => <option key={status}>{status}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead><tr><th>Sample ID</th><th>Status</th><th>Missing Person</th><th>Source</th><th>Sample Type</th><th>Lab</th><th>DNA Profile</th><th>Match Details</th></tr></thead>
                <tbody>
                  {rows.map(item => (
                    <tr key={item.sampleId}>
                      <td className="fw-semibold"><Link to={`/dna-samples/${item.sampleId}`}>#{item.sampleId}</Link></td>
                      <td><StatusBadge value={item.reportStatus}/></td>
                      <td>{item.personName}</td>
                      <td>{item.source}</td>
                      <td>{item.sampleType}</td>
                      <td>{item.labName || '—'}</td>
                      <td className="font-monospace">{item.dnaProfileCode}</td>
                      <td>
                        {/* Matched hole confirmed match er link, noile koto gula review er opekkhay */}
                        {item.confirmedMatchId
                          ? <Link to={`/dna-matches/${item.confirmedMatchId}`}>Confirmed match #{item.confirmedMatchId}</Link>
                          : item.pendingReviewMatches
                            ? <span className="text-secondary">{item.pendingReviewMatches} pending review</span>
                            : <span className="text-secondary">Not compared yet</span>}
                      </td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan="8" className="text-center text-secondary py-4">{isTechnician ? 'No analyzed samples in your laboratory yet.' : 'No samples match this report filter.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
