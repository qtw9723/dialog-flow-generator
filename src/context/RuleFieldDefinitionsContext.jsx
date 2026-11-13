import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { API_ENDPOINTS } from '../lib/constants'

export const RuleFieldDefinitionsContext = createContext()

export function RuleFieldDefinitionsProvider({ children }) {
  const [fieldDefinitions, setFieldDefinitions] = useState([])
  const [currentReferenceId, setCurrentReferenceId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { request } = useApi()

  // Load field definitions when currentReferenceId changes
  useEffect(() => {
    if (!currentReferenceId) {
      setFieldDefinitions([])
      return
    }

    const loadDefinitions = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await request(
          `${API_ENDPOINTS.ADMIN_RULE_FIELD_DEFINITIONS}?reference_id=${currentReferenceId}`
        )
        const definitionsArray = Array.isArray(data) ? data : (data ? [data] : [])
        setFieldDefinitions(definitionsArray)
        console.log('[RuleFieldDefinitionsContext] Loaded definitions:', definitionsArray.length)
      } catch (err) {
        if (err.message.includes('Unauthorized') || err.message.includes('401')) {
          console.log('[RuleFieldDefinitionsContext] Admin rule field definitions not available (not authenticated)')
          setError(null)
        } else {
          console.error('[RuleFieldDefinitionsContext] Failed to fetch:', err)
          setError(err.message)
        }
        setFieldDefinitions([])
      } finally {
        setLoading(false)
      }
    }

    loadDefinitions()
  }, [currentReferenceId, request])

  const createDefinition = useCallback(async (definition) => {
    try {
      const data = await request(API_ENDPOINTS.ADMIN_RULE_FIELD_DEFINITIONS, {
        method: 'POST',
        body: definition
      })
      setFieldDefinitions([...fieldDefinitions, data])
      console.log('[RuleFieldDefinitionsContext] Definition created:', data.id)
      return data
    } catch (err) {
      console.error('[RuleFieldDefinitionsContext] Create failed:', err)
      throw err
    }
  }, [fieldDefinitions, request])

  const updateDefinition = useCallback(async (id, updates) => {
    try {
      const data = await request(
        `${API_ENDPOINTS.ADMIN_RULE_FIELD_DEFINITIONS}?id=${id}`,
        { method: 'PATCH', body: updates }
      )
      setFieldDefinitions(fieldDefinitions.map(d => d.id === id ? data : d))
      console.log('[RuleFieldDefinitionsContext] Definition updated:', id)
      return data
    } catch (err) {
      console.error('[RuleFieldDefinitionsContext] Update failed:', err)
      throw err
    }
  }, [fieldDefinitions, request])

  const deleteDefinition = useCallback(async (id) => {
    try {
      await request(`${API_ENDPOINTS.ADMIN_RULE_FIELD_DEFINITIONS}?id=${id}`, {
        method: 'DELETE'
      })
      setFieldDefinitions(fieldDefinitions.filter(d => d.id !== id))
      console.log('[RuleFieldDefinitionsContext] Definition deleted:', id)
    } catch (err) {
      console.error('[RuleFieldDefinitionsContext] Delete failed:', err)
      throw err
    }
  }, [fieldDefinitions, request])

  const refetch = useCallback(async () => {
    if (!currentReferenceId) return

    setLoading(true)
    setError(null)
    try {
      const data = await request(
        `${API_ENDPOINTS.ADMIN_RULE_FIELD_DEFINITIONS}?reference_id=${currentReferenceId}`
      )
      const definitionsArray = Array.isArray(data) ? data : (data ? [data] : [])
      setFieldDefinitions(definitionsArray)
      console.log('[RuleFieldDefinitionsContext] Refetch completed:', definitionsArray.length)
      setError(null)
    } catch (err) {
      if (err.message.includes('Unauthorized') || err.message.includes('401')) {
        console.log('[RuleFieldDefinitionsContext] Admin rule field definitions not available (not authenticated)')
        setError(null)
      } else {
        console.error('[RuleFieldDefinitionsContext] Failed to refetch:', err)
        setError(err.message)
      }
      setFieldDefinitions([])
    } finally {
      setLoading(false)
    }
  }, [currentReferenceId, request])

  return (
    <RuleFieldDefinitionsContext.Provider value={{
      fieldDefinitions,
      currentReferenceId,
      setCurrentReferenceId,
      loading,
      error,
      createDefinition,
      updateDefinition,
      deleteDefinition,
      refetch
    }}>
      {children}
    </RuleFieldDefinitionsContext.Provider>
  )
}

export function useRuleFieldDefinitions() {
  const context = useContext(RuleFieldDefinitionsContext)
  if (!context) {
    throw new Error('useRuleFieldDefinitions must be used within RuleFieldDefinitionsProvider')
  }
  return context
}
