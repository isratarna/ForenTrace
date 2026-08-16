import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import Login from '../pages/Auth'
import { Dashboard } from '../pages/Dashboards'
import { CaseDetails, CaseForm, Cases, FamilyMembers, MissingPersonDetails, MissingPersonForm, MissingPersons } from '../pages/Investigation'
import { DNAAnalysis, MatchDetails, Matches, SampleDetails, SampleForm, Samples } from '../pages/Laboratory'
import { AdminList, Profile, Reports } from '../pages/Administration'
import { dashboardPath, useRole } from '../components/RoleContext'

function RequireAuth() { const { user } = useRole(); return user ? <Outlet /> : <Navigate to="/login" replace /> }
function HomeRedirect() { const { role } = useRole(); return <Navigate to={dashboardPath(role)} replace /> }
function RoleDashboard({ role: requiredRole }) { const { role } = useRole(); return role === requiredRole ? <Dashboard type={role} /> : <Navigate to={dashboardPath(role)} replace /> }
function RoleGuard({ allowedRoles }) { const { role } = useRole(); return allowedRoles.includes(role) ? <Outlet /> : <Navigate to={dashboardPath(role)} replace /> }

export default function AppRoutes() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<RequireAuth />}><Route element={<AppLayout />}>
      <Route index element={<HomeRedirect />} />
      <Route path="admin/dashboard" element={<RoleDashboard role="Admin" />} />
      <Route path="officer/dashboard" element={<RoleDashboard role="Officer" />} />
      <Route path="lab/dashboard" element={<RoleDashboard role="Lab Technician" />} />
      <Route element={<RoleGuard allowedRoles={['Admin', 'Officer']} />}>
        <Route path="missing-persons" element={<MissingPersons />} />
        <Route path="missing-persons/:id" element={<MissingPersonDetails />} />
        <Route path="family-members" element={<FamilyMembers />} />
        <Route path="cases" element={<Cases />} />
        <Route path="cases/:id" element={<CaseDetails />} />
      </Route>
      <Route element={<RoleGuard allowedRoles={['Officer']} />}>
        <Route path="missing-persons/new" element={<MissingPersonForm />} />
        <Route path="cases/new" element={<CaseForm />} />
        <Route path="dna-samples/new" element={<SampleForm />} />
      </Route>
      <Route element={<RoleGuard allowedRoles={['Admin', 'Officer', 'Lab Technician']} />}>
        <Route path="dna-samples" element={<Samples />} />
        <Route path="dna-samples/:id" element={<SampleDetails />} />
        <Route path="dna-matches" element={<Matches />} />
        <Route path="dna-matches/:id" element={<MatchDetails />} />
        <Route path="reports" element={<Reports />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route element={<RoleGuard allowedRoles={['Lab Technician']} />}><Route path="lab/analysis/:id" element={<DNAAnalysis />} /></Route>
      <Route element={<RoleGuard allowedRoles={['Admin']} />}>
        <Route path="admin/police-stations" element={<AdminList kind="stations" />} />
        <Route path="admin/officers" element={<AdminList kind="officers" />} />
        <Route path="admin/labs" element={<AdminList kind="labs" />} />
        <Route path="admin/technicians" element={<AdminList kind="technicians" />} />
        <Route path="admin/users" element={<AdminList kind="users" />} />
      </Route>
    </Route></Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
}
