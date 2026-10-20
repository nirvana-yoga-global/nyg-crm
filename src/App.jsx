import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import AccessDenied from './pages/AccessDenied'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import People from './pages/People'
import PersonProfile from './pages/PersonProfile'
import ReviewQueue from './pages/ReviewQueue'
import Students from './pages/Students'
import StudentProfile from './pages/StudentProfile'
import Fees from './pages/Fees'
import Araiki from './pages/Araiki'
import Meetups from './pages/Meetups'
import Settings from './pages/Settings'
import Yoga from './pages/Yoga'
import BatchPage from './pages/BatchPage'

function AppContent() {
  const { user, isAdmin, isFaculty, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-[#1742b5] rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">N</span>
          </div>
          <p className="text-gray-500 text-sm">Loading NYG CRM...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  if (isAdmin) {
    return (
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/people" element={<People />} />
          <Route path="/people/review" element={<ReviewQueue />} />
          <Route path="/people/:id" element={<PersonProfile />} />
          <Route path="/students" element={<Students />} />
          <Route path="/students/:id" element={<StudentProfile />} />
          <Route path="/fees" element={<Fees />} />
          <Route path="/araiki" element={<Araiki />} />
          <Route path="/yoga" element={<Yoga />} />
          <Route path="/yoga/:id" element={<BatchPage />} />
          <Route path="/meetups" element={<Meetups />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/access-denied" element={<AccessDenied />} />
        </Routes>
      </Layout>
    )
  }

  if (isFaculty) {
    return (
      <Layout>
        <Routes>
          <Route path="/yoga" element={<Yoga />} />
          <Route path="/yoga/:id" element={<BatchPage />} />
          <Route path="*" element={<Navigate to="/yoga" replace />} />
        </Routes>
      </Layout>
    )
  }

  return <AccessDenied />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
