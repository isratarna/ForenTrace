import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from './Ui'
import { getFamilyDnaByPerson } from '../services/dnaService'

// Missing person details page e family DNA reference info dekhay (Member 1 - Issue 2)
// Family Member ──> DNA Sample ──> Missing Person link ta ekhane visible hoy
// refreshKey change hole data abar load hoy (family add/remove ba DNA register er por)
export default function FamilyDnaPanel({ personId, refreshKey = 0 }) {
  const [data, setData] = useState({ summary: null, familyMembers: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!personId) return
    let mounted = true
    setLoading(true)
    setError('')
    getFamilyDnaByPerson(personId)
      .then(result => { if (mounted) setData(result) })
      .catch(requestError => { if (mounted) setError(requestError.response?.data?.message || 'Failed to load family DNA information.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [personId, refreshKey])

  const { summary, familyMembers } = data

  return (
    <div className="card mt-4">
      <div className="card-header bg-white"><strong>Family DNA References</strong></div>
      <div className="card-body">
        {loading && <div className="text-secondary">Loading family DNA information...</div>}
        {error && <div className="alert alert-danger mb-0">{error}</div>}

        {!loading && !error && summary && (
          <>
            {/* Summary: koto jon family member sample diyeche */}
            <div className="d-flex flex-wrap gap-3 mb-3 small">
              <span>Family members: <b>{summary.totalFamilyMembers}</b></span>
              <span>Members with reference sample: <b>{summary.membersWithSample}</b></span>
              <span>Reference samples: <b>{summary.totalReferenceSamples}</b></span>
              <span>Analyzed: <b>{summary.analyzedReferenceSamples}</b></span>
            </div>

            {!familyMembers.length ? (
              <div className="alert alert-secondary mb-0">No family members registered yet.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead><tr><th>Family Member</th><th>Relationship</th><th>Sample</th><th>Type</th><th>Lab</th><th>Collected</th><th>DNA Profile</th><th>Status</th></tr></thead>
                  <tbody>
                    {familyMembers.map(member => member.samples.length ? (
                      // Ek member er ekadhik sample thakle proti sample alada row te
                      member.samples.map((sample, index) => (
                        <tr key={`${member.familyId}-${sample.sampleId}`}>
                          <td className="fw-semibold">{index === 0 ? member.name : ''}</td>
                          <td>{index === 0 ? member.relationship : ''}</td>
                          <td><Link to={`/dna-samples/${sample.sampleId}`}>#{sample.sampleId}</Link></td>
                          <td>{sample.sampleType}</td>
                          <td>{sample.labName || '—'}</td>
                          <td>{sample.collectionDate}</td>
                          <td>{sample.dnaProfileCode || '—'}</td>
                          <td><StatusBadge value={sample.status}/></td>
                        </tr>
                      ))
                    ) : (
                      // Sample nai — register korar shortcut link (form e person + family pre-selected thakbe)
                      <tr key={member.familyId}>
                        <td className="fw-semibold">{member.name}</td>
                        <td>{member.relationship}</td>
                        <td colSpan="5" className="text-secondary">No reference sample yet</td>
                        <td><Link className="btn btn-sm btn-outline-primary" to={`/dna-samples/new?personId=${personId}&familyId=${member.familyId}`}>Register Sample</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
