import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { API_ENDPOINTS } from '../lib/constants'

export const RuleValueGeneratorsContext = createContext()

export function RuleValueGeneratorsProvider({ children }) {
  const [valueGenerators, setValueGenerators] = useState([])
  const [currentReferenceId, setCurrentReferenceId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { request } = useApi()

  // Load value generators when currentReferenceId changes
  useEffect(() => {
    if (!currentReferenceId) {
      setValueGenerators([])
      return
    }

    const loadGenerators = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await request(
          `${API_ENDPOINTS.ADMIN_RULE_VALUE_GENERATORS}?reference_id=${currentReferenceId}`
        )
        const generatorsArray = Array.isArray(data) ? data : (data ? [data] : [])
        setValueGenerators(generatorsArray)
        console.log('[RuleValueGeneratorsContext] Loaded generators:', generatorsArray.length)
      } catch (err) {
        if (err.message.includes('Unauthorized') || err.message.includes('401')) {
          console.log('[RuleValueGeneratorsContext] Admin rule value generators not available (not authenticated)')
          setError(null)
        } else {
          console.error('[RuleValueGeneratorsContext] Failed to fetch:', err)
          setError(err.message)
        }
        setValueGenerators([])
      } finally {
        setLoading(false)
      }
    }

    loadGenerators()
  }, [currentReferenceId, request])

  const createGenerator = useCallback(async (generator) => {
    try {
      const data = await request(API_ENDPOINTS.ADMIN_RULE_VALUE_GENERATORS, {
        method: 'POST',
        body: generator
      })
      setValueGenerators([...valueGenerators, data])
      console.log('[RuleValueGeneratorsContext] Generator created:', data.id)
      return data
    } catch (err) {
      console.error('[RuleValueGeneratorsContext] Create failed:', err)
      throw err
    }
  }, [valueGenerators, request])

  const updateGenerator = useCallback(async (id, updates) => {
    try {
      const data = await request(
        `${API_ENDPOINTS.ADMIN_RULE_VALUE_GENERATORS}?id=${id}`,
        { method: 'PATCH', body: updates }
      )
      setValueGenerators(valueGenerators.map(g => g.id === id ? data : g))
      console.log('[RuleValueGeneratorsContext] Generator updated:', id)
      return data
    } catch (err) {
      console.error('[RuleValueGeneratorsContext] Update failed:', err)
      throw err
    }
  }, [valueGenerators, request])

  const deleteGenerator = useCallback(async (id) => {
    try {
      await request(`${API_ENDPOINTS.ADMIN_RULE_VALUE_GENERATORS}?id=${id}`, {
        method: 'DELETE'
      })
      setValueGenerators(valueGenerators.filter(g => g.id !== id))
      console.log('[RuleValueGeneratorsContext] Generator deleted:', id)
    } catch (err) {
      console.error('[RuleValueGeneratorsContext] Delete failed:', err)
      throw err
    }
  }, [valueGenerators, request])

  const refetch = useCallback(async () => {
    if (!currentReferenceId) return

    setLoading(true)
    setError(null)
    try {
      const data = await request(
        `${API_ENDPOINTS.ADMIN_RULE_VALUE_GENERATORS}?reference_id=${currentReferenceId}`
      )
      const generatorsArray = Array.isArray(data) ? data : (data ? [data] : [])
      setValueGenerators(generatorsArray)
      console.log('[RuleValueGeneratorsContext] Refetch completed:', generatorsArray.length)
      setError(null)
    } catch (err) {
      if (err.message.includes('Unauthorized') || err.message.includes('401')) {
        console.log('[RuleValueGeneratorsContext] Admin rule value generators not available (not authenticated)')
        setError(null)
      } else {
        console.error('[RuleValueGeneratorsContext] Failed to refetch:', err)
        setError(err.message)
      }
      setValueGenerators([])
    } finally {
      setLoading(false)
    }
  }, [currentReferenceId, request])

  return (
    <RuleValueGeneratorsContext.Provider value={{
      valueGenerators,
      currentReferenceId,
      setCurrentReferenceId,
      loading,
      error,
      createGenerator,
      updateGenerator,
      deleteGenerator,
      refetch
    }}>
      {children}
    </RuleValueGeneratorsContext.Provider>
  )
}

export function useRuleValueGenerators() {
  const context = useContext(RuleValueGeneratorsContext)
  if (!context) {
    throw new Error('useRuleValueGenerators must be used within RuleValueGeneratorsProvider')
  }
  return context
}
