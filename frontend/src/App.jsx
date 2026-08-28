import { BrowserRouter } from 'react-router-dom'
import { DataProvider } from './data/DataContext'
import AppRoutes from './routes/AppRoutes'

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <AppRoutes />
      </DataProvider>
    </BrowserRouter>
  )
}