import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useLoading } from '../context/LoadingContext'

export function useApi() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { show, hide } = useLoading()

  const request = useCallback(async (endpoint, options = {}) => {
    setLoading(true)
    setError(null)
    // loadingMessage가 있으면 전역 오버레이("생성 중…")를 표시(생성·추출 등 긴 작업 공통 피드백).
    const { method = 'GET', body = null, loadingMessage = null } = options
    if (loadingMessage) show(loadingMessage)
    const adminToken = localStorage.getItem('adminToken')
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    // 관리자 토큰이 있으면 쿼리 파라미터로 추가
    let url = endpoint
    if (method !== 'GET' && adminToken) {
      const separator = endpoint.includes('?') ? '&' : '?'
      url = `${endpoint}${separator}token=${encodeURIComponent(adminToken)}`
    }

    console.log(`[useApi] ${method} ${endpoint}${adminToken && method !== 'GET' ? ' (with token)' : ''}`, {
      bodyProvided: !!body,
      body
    })

    try {
      // 로그인한 테스터면 사용자 access token을 보내 Edge Function이 소유자를 식별하게 한다.
      // (세션 없으면 anon key — 로그인 화면/관리자(master) 호출.)
      const { data: { session } } = await supabase.auth.getSession()
      const bearer = session?.access_token || anonKey
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`
      }

      const stringifiedBody = body ? JSON.stringify(body) : null
      console.log('[useApi] Stringified body:', stringifiedBody)

      const response = await fetch(url, {
        method,
        headers,
        body: stringifiedBody
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.error || 'API request failed')
      }

      // Handle empty responses
      const text = await response.text()
      if (!text) {
        return {}
      }

      const data = JSON.parse(text)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
      if (loadingMessage) hide()
    }
  }, [show, hide])

  return { request, loading, error }
}
