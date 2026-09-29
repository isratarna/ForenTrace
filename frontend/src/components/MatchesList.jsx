import React from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from './Ui'

// Match gulo ekhon real API (/api/dna-matches) theke ashe, tai "(Sample data)" mock label ar lagbe na
// Match ID te click korle match details page e jabe
export default function MatchesList({ matches = [] }) {
  if (!matches || !matches.length) return <div className="alert alert-secondary">No DNA matches available.</div>

  return (
    <div>
      <div className="mb-2 small text-muted">DNA Matches</div>
      <div className="table-responsive">
        <table className="table table-sm">
          <thead>
            <tr><th>Match</th><th>Unknown</th><th>Matched</th><th>Similarity</th><th>Confidence</th><th>Date</th><th>Status</th></tr>
          </thead>
          <tbody>
            {matches.map(m => (
              <tr key={m.match_id}>
                <td><Link to={`/dna-matches/${m.match_id}`}>#{m.match_id}</Link></td>
                <td>#{m.unknown_sample_id}{m.unknownSample && <small className="d-block text-secondary">{m.unknownSample.provider}</small>}</td>
                <td>#{m.matched_sample_id}{m.matchedSample && <small className="d-block text-secondary">{m.matchedSample.provider}</small>}</td>
                <td>{m.similarity_percentage}%</td>
                <td><StatusBadge value={m.confidence_level}/></td>
                <td>{m.match_date}</td>
                <td><StatusBadge value={m.match_status}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
