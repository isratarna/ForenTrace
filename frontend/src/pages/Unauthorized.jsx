import { Link } from 'react-router-dom'

export default function Unauthorized() {
  return (
    <div className="container py-5 text-center">
      <h2>Access Denied</h2>

      <p>
        You do not have permission to access this page.
      </p>

      <Link to="/" className="btn btn-primary">
        Go Back
      </Link>
    </div>
  )
}