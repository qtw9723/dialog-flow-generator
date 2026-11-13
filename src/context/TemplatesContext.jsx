import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { API_ENDPOINTS } from '../lib/constants'

const TemplatesContext = createContext()

export function TemplatesProvider({ children }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { request } = useApi()
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    console.log('[TemplatesContext] Initializing...')
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await request(API_ENDPOINTS.ADMIN_TEMPLATES)
        setTemplates(data)
      } catch (err) {
        console.error('[TemplatesContext] Failed to fetch:', err)
        setError(err.message)
        setTemplates([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [request])

  const createTemplate = useCallback(async (template) => {
    const data = await request(API_ENDPOINTS.ADMIN_TEMPLATES, {
      method: 'POST',
      body: template
    })
    setTemplates([...templates, data])
    return data
  }, [templates, request])

  const updateTemplate = useCallback(async (id, updates) => {
    const data = await request(`${API_ENDPOINTS.ADMIN_TEMPLATES}?id=${id}`, {
      method: 'PATCH',
      body: updates
    })
    setTemplates(templates.map(t => t.id === id ? data : t))
    return data
  }, [templates, request])

  const deleteTemplate = useCallback(async (id) => {
    await request(`${API_ENDPOINTS.ADMIN_TEMPLATES}?id=${id}`, {
      method: 'DELETE'
    })
    setTemplates(templates.filter(t => t.id !== id))
  }, [templates, request])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request(API_ENDPOINTS.ADMIN_TEMPLATES)
      setTemplates(data)
      setError(null)
    } catch (err) {
      console.error('[TemplatesContext] Failed to refetch:', err)
      setError(err.message)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [request])

  return (
    <TemplatesContext.Provider value={{ templates, loading, error, createTemplate, updateTemplate, deleteTemplate, refetch }}>
      {children}
    </TemplatesContext.Provider>
  )
}

export function useTemplates() {
  const context = useContext(TemplatesContext)
  if (!context) {
    throw new Error('useTemplates must be used within TemplatesProvider')
  }
  return context
}
