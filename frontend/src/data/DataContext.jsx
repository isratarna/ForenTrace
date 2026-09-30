import { createContext, useContext, useMemo, useState } from 'react'
import * as seed from './mockData'

const DATA_KEY = 'forentrace-records-v2'
// DNA samples ar matches ekhon real backend (/api/dna-samples, /api/dna-matches) theke ashe —
// tai mock 'samples' ar 'matches' collection ekhan theke baad deya hoyeche (Member 1 - Issue 7)
const collections = ['missingPeople', 'cases', 'familyMembers', 'stations', 'officers', 'labs', 'technicians']
const clone = value => JSON.parse(JSON.stringify(value))
const initialData = () => Object.fromEntries(collections.map(key => [key, clone(seed[key])]))
const hasCollections = value => collections.every(key => Array.isArray(value?.[key]))

function normalizeRecords(records) {
  // Purono localStorage e thaka mock samples/matches bad dei (kono page ar egulo use kore na)
  const { samples: _samples, matches: _matches, ...rest } = records
  return rest
}

function readData() {
  try {
    const saved = JSON.parse(localStorage.getItem(DATA_KEY) || 'null')
    if (hasCollections(saved)) return normalizeRecords(saved)
  } catch { /* use seeded records */ }
  return normalizeRecords(initialData())
}

function nextId(prefix, values) {
  const numbers = values.map(item => Number(String(item.id).match(/\d+$/)?.[0] || 0))
  return `${prefix}-${Math.max(...numbers, 0) + 1}`
}

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [data, setData] = useState(readData)
  const commit = next => {
    const normalized = normalizeRecords(next)
    setData(normalized)
    localStorage.setItem(DATA_KEY, JSON.stringify(normalized))
  }

  const api = useMemo(() => ({
    data,
    addPerson(values) {
      const record = { ...values, id: nextId('MP', data.missingPeople) }
      commit({ ...data, missingPeople: [...data.missingPeople, record] })
      return record
    },
    addFamilyMember(values) {
      const record = { ...values, id: nextId('FM', data.familyMembers) }
      commit({ ...data, familyMembers: [...data.familyMembers, record] })
      return record
    },
    addCase(values) {
      const person = data.missingPeople.find(item => item.id === values.personId)
      const record = { ...values, id: nextId(`CASE-${new Date().getFullYear()}`, data.cases), person: person ? `${person.firstName} ${person.lastName}` : 'Unknown person', identifiedDate: values.identifiedDate || '—' }
      commit({ ...data, cases: [...data.cases, record] })
      return record
    },
    updateCase(id, values) {
      commit({ ...data, cases: data.cases.map(item => item.id === id ? { ...item, ...values, identifiedDate: values.identifiedDate || '—' } : item) })
    },
    // addSample / updateSample / updateMatch (mock) remove kora hoyeche — DNA er shob kaj ekhon dnaService diye real API te
    addAdminRecord(kind, values) {
      const prefix = { stations: 'PS', officers: 'OFF', labs: 'LAB', technicians: 'TECH' }[kind]
      const record = { ...values, id: nextId(prefix, data[kind]), status: values.status || 'Active' }
      commit({ ...data, [kind]: [...data[kind], record] })
      return record
    },
    updateAdminRecord(kind, id, values) {
      commit({ ...data, [kind]: data[kind].map(item => item.id === id ? { ...item, ...values } : item) })
    },
    removeAdminRecord(kind, id) {
      const record = data[kind].find(item => item.id === id)
      if (!record) return { ok: false, message: 'Record not found.' }
      // Mock samples na thakay lab/technician er "sample e use hocche" check ekhan theke baad (real check backend er FK RESTRICT kore)
      const used = (kind === 'stations' && (data.officers.some(item => item.station === record.name) || data.cases.some(item => item.station === record.name))) || (kind === 'labs' && data.technicians.some(item => item.lab === record.name)) || (kind === 'officers' && data.cases.some(item => item.officer === record.name))
      if (used) return { ok: false, message: 'This record is linked to an operational record and cannot be deleted.' }
      commit({ ...data, [kind]: data[kind].filter(item => item.id !== id) })
      return { ok: true }
    },
  }), [data])

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used inside DataProvider')
  return context
}
