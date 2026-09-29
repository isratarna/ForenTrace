import React from 'react'
import { StatusBadge } from './Ui'

// Sample gulo ekhon real API theke ashe, tai "(Sample data)" mock label ar lagbe na
export default function SamplesTable({ samples = [] }) {
  if (!samples || !samples.length) return <div className="alert alert-secondary">No DNA samples available.</div>

  return (
    <div>
      <div className="mb-2 small text-muted">DNA Samples</div>
      <div className="table-responsive">
        <table className="table table-sm">
          <thead>
            <tr><th>Sample ID</th><th>Type</th><th>Collected</th><th>Profile</th><th>Status</th></tr>
          </thead>
          <tbody>
            {samples.map(s => (
              <tr key={s.sample_id}><td>{s.sample_id}</td><td>{s.sample_type}</td><td>{s.collection_date}</td><td>{s.dna_profile_code}</td><td><StatusBadge value={s.status} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
