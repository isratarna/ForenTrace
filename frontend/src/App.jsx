import { BrowserRouter } from 'react-router-dom'
import { RoleProvider } from './components/RoleContext'
import { DataProvider } from './data/DataContext'
import AppRoutes from './routes/AppRoutes'

export default function App() {
  return <BrowserRouter><RoleProvider><DataProvider><AppRoutes /></DataProvider></RoleProvider></BrowserRouter>
}
