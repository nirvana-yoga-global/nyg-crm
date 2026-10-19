import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isFaculty, setIsFaculty] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        loadProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setIsAdmin(false)
        setIsFaculty(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    try {
      const [{ data: adminFlag }, { data: profileData }] = await Promise.all([
        supabase.rpc('is_admin'),
        supabase.from('profiles').select('*').eq('id', userId).single(),
      ])
      setIsAdmin(adminFlag === true)
      setIsFaculty(profileData?.role === 'faculty')
      setProfile(profileData)
    } catch {
      setIsAdmin(false)
      setIsFaculty(false)
    } finally {
      setLoading(false)
    }
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, isFaculty, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
