export const missingPeople = [
  { id: 'MP-1042', firstName: 'Amina', lastName: 'Rahman', gender: 'Female', dob: '1998-04-16', nationalId: '1987456210', bloodGroup: 'O+', height: '165 cm', weight: '58 kg', eyeColor: 'Brown', hairColor: 'Black', missingDate: '2026-07-21', location: 'Dhanmondi, Dhaka', city: 'Dhaka', status: 'Under Investigation', description: 'Last seen leaving her workplace.' },
  { id: 'MP-1041', firstName: 'Tanvir', lastName: 'Ahmed', gender: 'Male', dob: '2003-11-08', nationalId: '2003567891', bloodGroup: 'A+', height: '174 cm', weight: '71 kg', eyeColor: 'Brown', hairColor: 'Black', missingDate: '2026-07-18', location: 'Uttara, Dhaka', city: 'Dhaka', status: 'Identified', description: 'Reported missing after a bus journey.' },
  { id: 'MP-1040', firstName: 'Farzana', lastName: 'Islam', gender: 'Female', dob: '1989-02-25', nationalId: '1989564321', bloodGroup: 'B+', height: '158 cm', weight: '54 kg', eyeColor: 'Black', hairColor: 'Dark brown', missingDate: '2026-06-30', location: 'Kotwali, Chattogram', city: 'Chattogram', status: 'Pending', description: 'Family filed a report after no contact for three days.' },
]

export const cases = [
  { id: 'CASE-2026-087', person: 'Amina Rahman', personId: 'MP-1042', station: 'Dhanmondi Police Station', officer: 'Md. Hasan', reportDate: '2026-07-22', priority: 'High', status: 'Active', identifiedDate: '—', notes: 'Family samples submitted to Dhaka Forensic DNA Lab.' },
  { id: 'CASE-2026-086', person: 'Tanvir Ahmed', personId: 'MP-1041', station: 'Uttara Police Station', officer: 'Nusrat Jahan', reportDate: '2026-07-19', priority: 'Medium', status: 'Solved', identifiedDate: '2026-08-02', notes: 'Identity confirmed using a high-confidence DNA match.' },
  { id: 'CASE-2026-085', person: 'Farzana Islam', personId: 'MP-1040', station: 'Kotwali Police Station', officer: 'Md. Hasan', reportDate: '2026-07-01', priority: 'High', status: 'Pending', identifiedDate: '—', notes: 'Awaiting analysis of reference sample.' },
]

export const familyMembers = [
  { id: 'FM-3001', personId: 'MP-1042', name: 'Sadia Rahman', relation: 'Sister', phone: '+880 1712 555 223', email: 'sadia.rahman@example.com', address: 'Dhanmondi, Dhaka', sample: 'SMP-9021' },
  { id: 'FM-3002', personId: 'MP-1042', name: 'Kamal Rahman', relation: 'Father', phone: '+880 1814 401 119', email: 'kamal.rahman@example.com', address: 'Dhanmondi, Dhaka', sample: 'SMP-9022' },
]

// Mock DNA samples ar matches remove kora hoyeche — ekhon real API (/api/dna-samples, /api/dna-matches) — Member 1 Issue 7

export const stations = [
  { id: 'PS-01', name: 'Dhanmondi Police Station', district: 'Dhaka', city: 'Dhaka', address: 'Road 27, Dhanmondi', contact: '+880 2 913 1941', email: 'dhanmondi@police.gov.bd' },
  { id: 'PS-02', name: 'Uttara Police Station', district: 'Dhaka', city: 'Dhaka', address: 'Sector 7, Uttara', contact: '+880 2 891 4120', email: 'uttara@police.gov.bd' },
  { id: 'PS-03', name: 'Kotwali Police Station', district: 'Chattogram', city: 'Chattogram', address: 'Kotwali, Chattogram', contact: '+880 31 611 911', email: 'kotwali@police.gov.bd' },
]

export const officers = [
  { id: 'OFF-101', name: 'Md. Hasan', rank: 'Inspector', badge: 'BDP-4581', station: 'Dhanmondi Police Station', phone: '+880 1711 992 002', email: 'hasan@police.gov.bd', status: 'Active' },
  { id: 'OFF-102', name: 'Nusrat Jahan', rank: 'Sub-Inspector', badge: 'BDP-4612', station: 'Uttara Police Station', phone: '+880 1712 489 110', email: 'nusrat@police.gov.bd', status: 'Active' },
]

export const labs = [
  { id: 'LAB-01', name: 'Dhaka Forensic DNA Lab', city: 'Dhaka', address: 'Agargaon, Dhaka', contact: '+880 2 5501 2211', email: 'dhaka.lab@forentrace.gov.bd' },
  { id: 'LAB-02', name: 'National Forensic Lab', city: 'Dhaka', address: 'Sher-e-Bangla Nagar, Dhaka', contact: '+880 2 5501 2240', email: 'national.lab@forentrace.gov.bd' },
]

export const technicians = [
  { id: 'TECH-201', name: 'Dr. Farah Khan', designation: 'Senior DNA Analyst', lab: 'Dhaka Forensic DNA Lab', phone: '+880 1716 201 889', email: 'farah.khan@forentrace.gov.bd', status: 'Active' },
  { id: 'TECH-202', name: 'Rafiul Karim', designation: 'Lab Technician', lab: 'National Forensic Lab', phone: '+880 1716 209 772', email: 'rafiul.karim@forentrace.gov.bd', status: 'Active' },
]
