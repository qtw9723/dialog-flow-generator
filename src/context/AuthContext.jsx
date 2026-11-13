import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { API_ENDPOINTS } from '../lib/constants'

const AuthContext = createContext()

// 관리자(설정)는 기존 master 방식 유지. 테스터는 Supabase 이메일 OTP 로그인.
const ADMIN_ID = 'master'
const ADMIN_PW = 'master'

// 신뢰 기기 토큰(원본)은 이 기기의 localStorage에만 보관. 서버엔 sha256 해시만 저장된다.
const DEVICE_KEY = 'dialogflow_trusted_device'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function ensureDeviceToken() {
  let token = localStorage.getItem(DEVICE_KEY)
  if (!token) {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(DEVICE_KEY, token)
  }
  return token
}

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [user, setUser] = useState(null)      // 로그인한 테스터(Supabase user)
  const [status, setStatus] = useState(null)  // testers.status: pending|approved|blocked
  const [loading, setLoading] = useState(true)

  // 로그인한 테스터의 승인 상태 로드(RLS self-select).
  const loadStatus = async (u) => {
    if (!u) { setStatus(null); return }
    const { data } = await supabase.from('testers').select('status').eq('id', u.id).single()
    setStatus(data?.status ?? 'pending')
  }

  useEffect(() => {
    setIsAdmin(!!localStorage.getItem('adminToken'))
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      const u = data?.session?.user ?? null
      setUser(u)
      await loadStatus(u)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      loadStatus(u)
    })
    return () => { mounted = false; sub?.subscription?.unsubscribe?.() }
  }, [])

  // 관리자 로그인(기존)
  const login = (id, password) => {
    if (id === ADMIN_ID && password === ADMIN_PW) {
      localStorage.setItem('adminToken', btoa(JSON.stringify({ role: 'master' })))
      setIsAdmin(true)
      return true
    }
    return false
  }

  // 테스터: 이메일로 코드 발송(없으면 자동 회원가입)
  const sendCode = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    if (error) throw error
  }
  // 테스터: 코드 검증 → 로그인. 성공하면 이 기기를 신뢰 기기로 등록(다음부턴 이메일만으로 로그인).
  const verifyCode = async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) throw error
    setUser(data?.user ?? null)
    await registerTrustedDevice()
    return data?.user ?? null
  }

  // 이 기기를 신뢰 기기로 등록(베스트에포트). 서버엔 토큰의 sha256만 저장된다.
  const registerTrustedDevice = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const deviceToken = ensureDeviceToken()
      await fetch(`${API_ENDPOINTS.TRUSTED_DEVICE}?action=register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ token: deviceToken }),
      })
    } catch { /* best-effort: 실패해도 OTP 로그인엔 영향 없음 */ }
  }

  // 신뢰 기기면 이메일만으로 즉시 로그인 시도. 성공 true, 신뢰 기기 아니면 false → 호출부가 OTP로 폴백.
  const trustedDeviceLogin = async (email) => {
    const deviceToken = localStorage.getItem(DEVICE_KEY)
    if (!deviceToken) return false
    let data
    try {
      const res = await fetch(`${API_ENDPOINTS.TRUSTED_DEVICE}?action=login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ email, token: deviceToken }),
      })
      if (!res.ok) return false
      data = await res.json()
    } catch { return false }
    if (!data?.trusted || !data.token_hash) return false

    // magiclink token_hash → 세션 수립. type은 magiclink 우선, 실패 시 email로 폴백.
    let verify = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
    if (verify.error) {
      verify = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' })
    }
    if (verify.error) return false
    const u = verify.data?.user ?? null
    setUser(u)
    await loadStatus(u)
    return true
  }

  const logout = async () => {
    localStorage.removeItem('adminToken')
    setIsAdmin(false)
    try { await supabase.auth.signOut() } catch { /* noop */ }
    setUser(null)
    setStatus(null)
  }

  const isAuthed = isAdmin || !!user
  const isApproved = isAdmin || status === 'approved'

  return (
    <AuthContext.Provider value={{ isAdmin, user, status, isAuthed, isApproved, loading, login, logout, sendCode, verifyCode, trustedDeviceLogin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
