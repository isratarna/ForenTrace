import { useEffect, useState } from 'react'
import { PageHeader } from '../components/Ui'

export default function IntersectionReport() {
  const [labs, setLabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setLoading(true)
        setError('')
        const resp = await fetch('http://localhost:8000/api/reports/intersection', { credentials: 'include' })
        const json = await resp.json()
        if (!active) return
        if (!resp.ok) throw new Error(json.message || 'Failed to load report')
        setLabs(json.labs || [])
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [])

  return (
    <>
      <PageHeader title="Labs Intersection Report" subtitle="Labs with above-average technician capacity and active technicians." />

      {loading && <div className="card"><div className="card-body text-center text-secondary py-4">Loading report...</div></div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr><th>Lab Name</th><th>Capacity (Technician Count)</th></tr>
              </thead>
              <tbody>
                {labs.length ? labs.map(l => (
                  <tr key={l.lab_name}><td>{l.lab_name}</td><td>{l.capacity}</td></tr>
                )) : <tr><td colSpan="2" className="text-center text-secondary py-4">No labs meet the criteria.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
