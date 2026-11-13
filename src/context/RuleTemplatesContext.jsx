import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { API_ENDPOINTS } from '../lib/constants'

const RuleTemplatesContext = createContext()

export function RuleTemplatesProvider({ children }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { request } = useApi()
  const hasLoadedRef = useRef(false)

  // Initial load
  useEffect(() => {
    console.log('[RuleTemplatesContext] Initializing...')
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await request(API_ENDPOINTS.ADMIN_RULE_TEMPLATES)
        const templatesArray = Array.isArray(data) ? data : (data ? [data] : [])
        setTemplates(templatesArray)
        console.log('[RuleTemplatesContext] Loaded templates:', templatesArray.length)
      } catch (err) {
        if (err.message.includes('Unauthorized') || err.message.includes('401')) {
          console.log('[RuleTemplatesContext] Admin rule templates not available (not authenticated)')
          setError(null)
        } else {
          console.error('[RuleTemplatesContext] Failed to fetch:', err)
          setError(err.message)
        }
        setTemplates([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [request])

  // CRUD operations with useCallback for memoization
  const createTemplate = useCallback(async (template) => {
    try {
      const data = await request(API_ENDPOINTS.ADMIN_RULE_TEMPLATES, {
        method: 'POST',
        body: template
      })
      setTemplates([...templates, data])
      console.log('[RuleTemplatesContext] Template created:', data.id)
      return data
    } catch (err) {
      console.error('[RuleTemplatesContext] Create failed:', err)
      throw err
    }
  }, [templates, request])

  const updateTemplate = useCallback(async (id, updates) => {
    try {
      const data = await request(`${API_ENDPOINTS.ADMIN_RULE_TEMPLATES}?id=${id}`, {
        method: 'PATCH',
        body: updates
      })
      setTemplates(templates.map(t => t.id === id ? data : t))
      console.log('[RuleTemplatesContext] Template updated:', id)
      return data
    } catch (err) {
      console.error('[RuleTemplatesContext] Update failed:', err)
      throw err
    }
  }, [templates, request])

  const deleteTemplate = useCallback(async (id) => {
    try {
      await request(`${API_ENDPOINTS.ADMIN_RULE_TEMPLATES}?id=${id}`, {
        method: 'DELETE'
      })
      setTemplates(templates.filter(t => t.id !== id))
      console.log('[RuleTemplatesContext] Template deleted:', id)
    } catch (err) {
      console.error('[RuleTemplatesContext] Delete failed:', err)
      throw err
    }
  }, [templates, request])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request(API_ENDPOINTS.ADMIN_RULE_TEMPLATES)
      const templatesArray = Array.isArray(data) ? data : (data ? [data] : [])
      setTemplates(templatesArray)
      console.log('[RuleTemplatesContext] Refetch completed:', templatesArray.length)
      setError(null)
    } catch (err) {
      if (err.message.includes('Unauthorized') || err.message.includes('401')) {
        console.log('[RuleTemplatesContext] Admin rule templates not available (not authenticated)')
        setError(null)
      } else {
        console.error('[RuleTemplatesContext] Failed to refetch:', err)
        setError(err.message)
      }
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [request])

  return (
    <RuleTemplatesContext.Provider value={{
      templates,
      loading,
      error,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      refetch
    }}>
      {children}
    </RuleTemplatesContext.Provider>
  )
}

export function useRuleTemplates() {
  const context = useContext(RuleTemplatesContext)
  if (!context) {
    throw new Error('useRuleTemplates must be used within RuleTemplatesProvider')
  }
  return context
}
