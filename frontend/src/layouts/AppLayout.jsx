import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navByRole = {
  Admin: [
    ['Dashboard', '/admin/dashboard'],
    ['Missing Persons', '/missing-persons'],
    ['Investigation Cases', '/cases'],
    ['DNA Samples', '/dna-samples'],
    ['DNA Matches', '/dna-matches'],
    ['Police Stations', '/admin/police-stations'],
    ['Police Officers', '/admin/officers'],
    ['DNA Labs', '/admin/labs'],
    ['Lab Technicians', '/admin/technicians'],
    ['DNA Analytics', '/dna-analytics'],
    ['Users & Accounts', '/admin/users'],
    ['Reports', '/reports']
  ],
  Officer: [
    ['Dashboard', '/officer/dashboard'],
    ['Missing Persons', '/missing-persons'],
    ['Investigation Cases', '/cases'],
    ['DNA Samples', '/dna-samples'],
    ['DNA Matches', '/dna-matches'],
    ['Reports', '/reports']
  ],
  'Lab Technician': [
    ['Dashboard', '/lab/dashboard'],
    ['DNA Samples', '/dna-samples'],
    ['DNA Matches', '/dna-matches'],
    ['Reports', '/reports']
  ],
}

export default function AppLayout() {
  const { role, user, logout } = useAuth()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-icon">FT</span>
          <span>ForenTrace<small>DNA Identification System</small></span>
        </NavLink>
        <div className="role-label">{role} portal</div>
        <nav>
          {navByRole[role]?.map(([label, path]) => (
            <NavLink key={path} to={path} className="side-link">{label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/profile" className="side-link">My Profile</NavLink>
          <button
            type="button"
            className="side-link border-0 bg-transparent w-100 text-start"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <span className="text-secondary small">Authorized forensic records system</span>
          <div className="d-flex align-items-center gap-2">
            <span className="small text-secondary d-none d-sm-inline">{user?.name}</span>
            <NavLink to="/profile" className="user-chip" aria-label="My profile">{user?.initials}</NavLink>
          </div>
        </header>
        <section className="content-wrap">
          <Outlet />
        </section>
      </main>
    </div>
  )
}