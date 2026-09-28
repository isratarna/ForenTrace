import { useState } from 'react'
import { PageHeader, SearchFilters } from '../components/Ui'
import { useData } from '../data/DataContext'
import FamilyMembersManager from '../components/FamilyMembersManager'

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
  return (
    <>
      <PageHeader title="Family Members" subtitle="Family reference records linked to missing persons." />
      <FamilyMembersManager />
    </>
  )
}
