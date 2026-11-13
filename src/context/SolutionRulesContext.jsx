import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { API_ENDPOINTS, SOLUTION_RULE_DB_CATEGORIES } from '../lib/constants'

const SolutionRulesContext = createContext()

// 모든 DB 카테고리를 빈 배열로 초기화한 객체를 만든다.
const createEmptyRulesByCategory = () =>
  Object.fromEntries(SOLUTION_RULE_DB_CATEGORIES.map((category) => [category, []]))

export function SolutionRulesProvider({ children }) {
  const [rules, setRules] = useState(() => createEmptyRulesByCategory())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { request } = useApi()
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    console.log('[SolutionRulesContext] Initializing...')
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        // Fetch all categories of solution rules
        const categories = SOLUTION_RULE_DB_CATEGORIES
        const rulesData = {}

        for (const category of categories) {
          try {
            console.log(`[SolutionRulesContext] Fetching category: ${category}`)
            const data = await request(`${API_ENDPOINTS.ADMIN_SOLUTION_RULES}?category=${encodeURIComponent(category)}`)
            rulesData[category] = Array.isArray(data) ? data : (data ? [data] : [])
            console.log(`[SolutionRulesContext] Fetched ${category}: ${rulesData[category].length} rules`)
          } catch (err) {
            console.warn(`[SolutionRulesContext] Failed to fetch ${category}:`, err.message)
            rulesData[category] = []
          }
        }

        setRules(rulesData)
        console.log('[SolutionRulesContext] All categories loaded successfully')
      } catch (err) {
        console.error('[SolutionRulesContext] Failed to fetch:', err)
        setError(err.message)
        setRules(createEmptyRulesByCategory())
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [request])

  const createRule = useCallback(async (category, ruleData) => {
    try {
      const data = await request(API_ENDPOINTS.ADMIN_SOLUTION_RULES, {
        method: 'POST',
        body: { category, ...ruleData }
      })
      setRules(prev => ({
        ...prev,
        [category]: [...(prev[category] || []), data]
      }))
      return data
    } catch (err) {
      console.error(`[SolutionRulesContext] Failed to create rule in ${category}:`, err)
      throw err
    }
  }, [request])

  const updateRule = useCallback(async (category, id, updates) => {
    try {
      const data = await request(`${API_ENDPOINTS.ADMIN_SOLUTION_RULES}?id=${id}&category=${category}`, {
        method: 'PATCH',
        body: updates
      })
      setRules(prev => ({
        ...prev,
        [category]: (prev[category] || []).map(rule => rule.id === id ? data : rule)
      }))
      return data
    } catch (err) {
      console.error(`[SolutionRulesContext] Failed to update rule in ${category}:`, err)
      throw err
    }
  }, [request])

  const deleteRule = useCallback(async (category, id) => {
    try {
      await request(`${API_ENDPOINTS.ADMIN_SOLUTION_RULES}?id=${id}&category=${category}`, {
        method: 'DELETE'
      })
      setRules(prev => ({
        ...prev,
        [category]: (prev[category] || []).filter(rule => rule.id !== id)
      }))
    } catch (err) {
      console.error(`[SolutionRulesContext] Failed to delete rule in ${category}:`, err)
      throw err
    }
  }, [request])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const categories = SOLUTION_RULE_DB_CATEGORIES
      const rulesData = {}

      for (const category of categories) {
        try {
          const data = await request(`${API_ENDPOINTS.ADMIN_SOLUTION_RULES}?category=${encodeURIComponent(category)}`)
          rulesData[category] = Array.isArray(data) ? data : []
        } catch (err) {
          console.warn(`[SolutionRulesContext] Failed to refetch ${category}:`, err)
          rulesData[category] = []
        }
      }

      setRules(rulesData)
      setError(null)
      console.log('[SolutionRulesContext] Refetch completed successfully')
    } catch (err) {
      console.error('[SolutionRulesContext] Failed to refetch:', err)
      setError(err.message)
      setRules(createEmptyRulesByCategory())
    } finally {
      setLoading(false)
    }
  }, [request])

  return (
    <SolutionRulesContext.Provider value={{ rules, loading, error, createRule, updateRule, deleteRule, refetch }}>
      {children}
    </SolutionRulesContext.Provider>
  )
}

export function useSolutionRules() {
  const context = useContext(SolutionRulesContext)
  if (!context) {
    throw new Error('useSolutionRules must be used within SolutionRulesProvider')
  }
  return context
}
