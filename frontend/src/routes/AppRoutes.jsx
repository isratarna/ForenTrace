import { Navigate, Route, Routes } from 'react-router-dom'

import AppLayout from '../layouts/AppLayout'
import Login from '../pages/Auth'
import Unauthorized from '../pages/Unauthorized'

import { Dashboard } from '../pages/Dashboards'
import DnaLabsPage from '../pages/DnaLabsPage'

import {
  FamilyMembers,
} from '../pages/Investigation'
import {
  MissingPersonDetails,
  MissingPersonForm,
  MissingPersons,
} from '../pages/MissingPersons'
import { CaseDetails, CaseForm, Cases } from '../pages/Cases'

import {
  DNAAnalysis,
  MatchDetails,
  Matches,
  SampleDetails,
  SampleForm,
  Samples,
} from '../pages/Laboratory'

import {
  AdminList,
  Profile,
  Reports,
} from '../pages/Administration'

import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/auth'
import ProtectedRoute from './ProtectedRoute'
import LabTechniciansPage from '../pages/LabTechniciansPage'


function HomeRedirect() {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <Navigate
      to={dashboardPath(user.role)}
      replace
    />
  )
}


export default function AppRoutes() {
  return (
    <Routes>

      {/* PUBLIC ROUTES */}

      <Route
        path="/login"
        element={<Login />}
      />
      <Route path="/dna-labs" element={<DnaLabsPage />} />
      <Route path="/lab-technicians" element={<LabTechniciansPage />} />

      <Route
        path="/unauthorized"
        element={<Unauthorized />}
      />


      {/* PROTECTED APPLICATION */}

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >

        <Route
          index
          element={<HomeRedirect />}
        />


        {/* DASHBOARDS */}

        <Route
          path="admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <Dashboard type="Admin" />
            </ProtectedRoute>
          }
        />

        <Route
          path="officer/dashboard"
          element={
            <ProtectedRoute allowedRoles={['Officer']}>
              <Dashboard type="Officer" />
            </ProtectedRoute>
          }
        />

        <Route
          path="lab/dashboard"
          element={
            <ProtectedRoute allowedRoles={['Lab Technician']}>
              <Dashboard type="Lab Technician" />
            </ProtectedRoute>
          }
        />


        {/* MISSING PERSON + CASE VIEW */}

        <Route
          path="missing-persons"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'Officer']}>
              <MissingPersons />
            </ProtectedRoute>
          }
        />

        <Route
          path="missing-persons/:id"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'Officer']}>
              <MissingPersonDetails />
            </ProtectedRoute>
          }
        />

        <Route
          path="family-members"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'Officer']}>
              <FamilyMembers />
            </ProtectedRoute>
          }
        />

        <Route
          path="cases"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'Officer']}>
              <Cases />
            </ProtectedRoute>
          }
        />

        <Route
          path="cases/:id"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'Officer']}>
              <CaseDetails />
            </ProtectedRoute>
          }
        />


        {/* OFFICER-ONLY CREATE OPERATIONS */}

        <Route
          path="missing-persons/new"
          element={
            <ProtectedRoute allowedRoles={['Officer']}>
              <MissingPersonForm />
            </ProtectedRoute>
          }
        />

        <Route
          path="cases/new"
          element={
            <ProtectedRoute allowedRoles={['Officer']}>
              <CaseForm />
            </ProtectedRoute>
          }
        />

        <Route
          path="dna-samples/new"
          element={
            <ProtectedRoute allowedRoles={['Officer']}>
              <SampleForm />
            </ProtectedRoute>
          }
        />


        {/* DNA RECORDS */}

        <Route
          path="dna-samples"
          element={
            <ProtectedRoute
              allowedRoles={[
                'Admin',
                'Officer',
                'Lab Technician',
              ]}
            >
              <Samples />
            </ProtectedRoute>
          }
        />

        <Route
          path="dna-samples/:id"
          element={
            <ProtectedRoute
              allowedRoles={[
                'Admin',
                'Officer',
                'Lab Technician',
              ]}
            >
              <SampleDetails />
            </ProtectedRoute>
          }
        />

        <Route
          path="dna-matches"
          element={
            <ProtectedRoute
              allowedRoles={[
                'Admin',
                'Officer',
                'Lab Technician',
              ]}
            >
              <Matches />
            </ProtectedRoute>
          }
        />

        <Route
          path="dna-matches/:id"
          element={
            <ProtectedRoute
              allowedRoles={[
                'Admin',
                'Officer',
                'Lab Technician',
              ]}
            >
              <MatchDetails />
            </ProtectedRoute>
          }
        />


        {/* LAB TECHNICIAN ANALYSIS */}

        <Route
          path="lab/analysis/:id"
          element={
            <ProtectedRoute allowedRoles={['Lab Technician']}>
              <DNAAnalysis />
            </ProtectedRoute>
          }
        />


        {/* COMMON ROUTES */}

        <Route
          path="reports"
          element={
            <ProtectedRoute
              allowedRoles={[
                'Admin',
                'Officer',
                'Lab Technician',
              ]}
            >
              <Reports />
            </ProtectedRoute>
          }
        />

        <Route
          path="profile"
          element={
            <ProtectedRoute
              allowedRoles={[
                'Admin',
                'Officer',
                'Lab Technician',
              ]}
            >
              <Profile />
            </ProtectedRoute>
          }
        />


        {/* ADMIN MANAGEMENT */}

        <Route
          path="admin/police-stations"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <AdminList kind="stations" />
            </ProtectedRoute>
          }
        />

        <Route
          path="admin/officers"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <AdminList kind="officers" />
            </ProtectedRoute>
          }
        />

        <Route
          path="admin/labs"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <AdminList kind="labs" />
            </ProtectedRoute>
          }
        />

        <Route
          path="admin/technicians"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <AdminList kind="technicians" />
            </ProtectedRoute>
          }
        />

        <Route
          path="admin/users"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <AdminList kind="users" />
            </ProtectedRoute>
          }
        />

      </Route>


      {/* UNKNOWN ROUTES */}

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />

    </Routes>
  )
}
