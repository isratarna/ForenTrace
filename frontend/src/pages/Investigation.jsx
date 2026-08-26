import { useState } from 'react'
import { PageHeader, SearchFilters } from '../components/Ui'
import { useData } from '../data/DataContext'

function SelectFilter({ label, value, values, onChange }) {
  return (
    <div className="col-md-2">
      <label className="form-label">{label}</label>
      <select value={value} onChange={event => onChange(event.target.value)} className="form-select">
        <option value="">All {label.toLowerCase()}s</option>
        {values.map(item => <option key={item.value ?? item} value={item.value ?? item}>{item.label ?? item}</option>)}
      </select>
    </div>
  )
}

const text = value => String(value ?? '').toLowerCase()
const matchesSearch = (item, query) => !query || Object.values(item).some(value => text(value).includes(text(query)))

export function FamilyMembers() {
  const { data: { familyMembers, missingPeople } } = useData()
  const [query, setQuery] = useState('')
  const [personId, setPersonId] = useState('')
  const rows = familyMembers.filter(item => matchesSearch(item, query) && (!personId || item.personId === personId))

  return (
    <>
      <PageHeader title="Family Members" subtitle="Family reference records linked to missing persons." />
      <SearchFilters onSearchChange={setQuery} onClear={() => setPersonId('')}>
        <SelectFilter label="Missing person" value={personId} values={missingPeople.map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}` }))} onChange={setPersonId} />
      </SearchFilters>
      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead><tr><th>Name</th><th>Relation</th><th>Phone</th><th>Email</th><th>Person ID</th></tr></thead>
              <tbody>
                {rows.map(member => (
                  <tr key={member.id}>
                    <td>{member.name}</td>
                    <td>{member.relation}</td>
                    <td>{member.phone || '—'}</td>
                    <td>{member.email || '—'}</td>
                    <td>{member.personId}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan="5" className="text-center text-secondary py-3">No family members recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
