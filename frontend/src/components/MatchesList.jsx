import React from 'react'
import dnaService from '../services/dnaService'

export default function MatchesList({ matches = [] }) {
  const mockLabel = dnaService.isMockDna() ? ' (Sample data)' : ''
  if (!matches || !matches.length) return <div className="alert alert-secondary">No DNA matches available.</div>

  return (
    <div>
      <div className="mb-2 small text-muted">DNA Matches{mockLabel}</div>
      <div className="table-responsive">
        <table className="table table-sm">
          <thead>
            <tr><th>Unknown</th><th>Matched</th><th>Similarity</th><th>Confidence</th><th>Date</th><th>Status</th></tr>
          </thead>
          <tbody>
            {matches.map(m => (
              <tr key={`${m.unknown_sample_id}-${m.matched_sample_id}`}><td>{m.unknown_sample_id}</td><td>{m.matched_sample_id}</td><td>{m.similarity_percentage}%</td><td>{m.confidence_level}</td><td>{m.match_date}</td><td>{m.match_status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
