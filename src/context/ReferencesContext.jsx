import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { API_ENDPOINTS } from '../lib/constants'

const ReferencesContext = createContext()

export function ReferencesProvider({ children }) {
  const [references, setReferences] = useState([])
  const [masterReference, setMasterReference] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { request } = useApi()
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    console.log('[ReferencesContext] Initializing...')
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await request(API_ENDPOINTS.ADMIN_REFERENCES)
        const refsArray = Array.isArray(data) ? data : (data ? [data] : [])
        setReferences(refsArray)

        // Find and set the active master reference
        const master = refsArray.find(ref => ref && ref.is_master === true)
        setMasterReference(master || null)
        console.log('[ReferencesContext] Master reference:', master ? master.name : 'none')
      } catch (err) {
        if (err.message.includes('Unauthorized') || err.message.includes('401')) {
          console.log('[ReferencesContext] Admin references not available (not authenticated)')
          setError(null)
        } else {
          console.error('[ReferencesContext] Failed to fetch:', err)
          setError(err.message)
        }
        setReferences([])
        setMasterReference(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [request])

  const uploadReference = useCallback(async (name, jsonData, isMaster = false) => {
    try {
      const data = await request(API_ENDPOINTS.ADMIN_REFERENCES, {
        method: 'POST',
        body: { name, json_data: jsonData, is_master: isMaster }
      })

      if (isMaster) {
        // Server has deactivated old master and set this as new master
        // Refresh all references to get consistent state from server
        console.log('[ReferencesContext] New master uploaded, refreshing all references from server')
        const updated = await request(API_ENDPOINTS.ADMIN_REFERENCES)
        setReferences(updated)
        setMasterReference(data)
      } else {
        // Add new child reference - this invalidates the master's unified template
        // since unified learning analyzes master + ALL children together
        console.log('[ReferencesContext] New child reference uploaded, marking master learning as pending')

        // Update master's learning status since the unified template is now outdated
        if (masterReference) {
          const updatedMaster = await request(`${API_ENDPOINTS.ADMIN_REFERENCES}?id=${masterReference.id}`, {
            method: 'PATCH',
            body: { unified_template_status: 'pending' }
          })

          // Update local master reference state
          setMasterReference(updatedMaster)
        }

        setReferences([...references, data])
      }

      // Note: Unified learning is triggered manually by user clicking the button
      // Do not auto-trigger to avoid unnecessary API calls

      return data
    } catch (err) {
      console.error('[ReferencesContext] Upload failed:', err)
      throw err
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [references, request])

  const learnRules = useCallback(async (id) => {
    try {
      const data = await request(API_ENDPOINTS.LEARN_RULES, {
        method: 'POST',
        body: { reference_id: id }
      })

      // Update the reference in state with the learned template
      setReferences(references.map(r =>
        r.id === id ? { ...r, template_status: 'completed', schema_validation_status: 'valid' } : r
      ))

      // If this is the master, update masterReference
      if (masterReference && masterReference.id === id) {
        setMasterReference(prev => ({
          ...prev,
          template_status: 'completed',
          schema_validation_status: 'valid'
        }))
      }

      return data
    } catch (err) {
      console.error('[ReferencesContext] Learning failed:', err)
      throw err
    }
  }, [references, masterReference, request])

  const updateReference = useCallback(async (id, updates) => {
    try {
      console.log('[ReferencesContext] updateReference called with:', {
        id,
        updates,
        hasScenarioDescription: 'scenario_description' in updates,
        scenarioDescriptionValue: updates.scenario_description
      })

      const data = await request(`${API_ENDPOINTS.ADMIN_REFERENCES}?id=${id}`, {
        method: 'PATCH',
        body: updates
      })

      // Log what's being updated
      const hasJsonData = 'json_data' in updates
      const templateStatus = data?.template_status
      const unifiedStatus = data?.unified_template_status

      console.log('[ReferencesContext] updateReference response:', {
        id,
        hasJsonData,
        templateStatus,
        unifiedStatus,
        scenario_description: data?.scenario_description
      })

      // Update the reference in state
      if (data) {
        setReferences(references.map(r =>
          r.id === id ? { ...r, ...data } : r
        ))
      }

      // If this is the master, update masterReference
      if (masterReference && masterReference.id === id) {
        setMasterReference(prev => ({
          ...prev,
          ...data
        }))
      } else if (masterReference && hasJsonData && !data.is_master) {
        // If we updated a child's JSON data, reset master's learning status
        // since the unified template is now outdated
        console.log('[ReferencesContext] Child JSON updated, resetting master learning status')
        const updatedMaster = await request(`${API_ENDPOINTS.ADMIN_REFERENCES}?id=${masterReference.id}`, {
          method: 'PATCH',
          body: { unified_template_status: 'pending' }
        })
        setMasterReference(updatedMaster)
      }

      return data
    } catch (err) {
      console.error('[ReferencesContext] Update failed:', err)
      throw err
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [references, masterReference, request])

  const deleteReference = useCallback(async (id) => {
    try {
      const isMasterRef = masterReference?.id === id

      await request(`${API_ENDPOINTS.ADMIN_REFERENCES}?id=${id}`, {
        method: 'DELETE'
      })

      const newReferences = references.filter(t => t.id !== id)
      setReferences(newReferences)

      // If we deleted the master, clear masterReference
      if (isMasterRef) {
        setMasterReference(null)
        console.log('[ReferencesContext] Master reference was deleted')
      } else {
        // If we deleted a child reference, reset master's learning status
        // since the unified template is now outdated
        const newMaster = newReferences.find(r => r.is_master)
        if (newMaster) {
          console.log('[ReferencesContext] Child reference deleted, resetting master learning status')
          const updatedMaster = await request(`${API_ENDPOINTS.ADMIN_REFERENCES}?id=${newMaster.id}`, {
            method: 'PATCH',
            body: { unified_template_status: 'pending' }
          })

          // Update local master reference state
          setMasterReference(updatedMaster)
        }
      }
    } catch (err) {
      console.error('[ReferencesContext] Delete failed:', err)
      throw err
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [references, masterReference, request])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request(API_ENDPOINTS.ADMIN_REFERENCES)
      setReferences(data)

      // Find and set the active master reference
      const master = data.find(ref => ref.is_master === true)
      setMasterReference(master || null)

      setError(null)
    } catch (err) {
      if (err.message.includes('Unauthorized') || err.message.includes('401')) {
        console.log('[ReferencesContext] Admin references not available (not authenticated)')
        setError(null)
      } else {
        console.error('[ReferencesContext] Failed to refetch:', err)
        setError(err.message)
      }
      setReferences([])
      setMasterReference(null)
    } finally {
      setLoading(false)
    }
  }, [request])

  const triggerUnifiedLearning = useCallback(async () => {
    if (!masterReference) {
      console.log('[ReferencesContext] No master reference, skipping unified learning')
      return
    }

    try {
      console.log('[ReferencesContext] Triggering unified learning for master:', masterReference.id)

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      console.log('[ReferencesContext] URL:', `${supabaseUrl}/functions/v1/learn-rules`)

      const response = await fetch(
        `${supabaseUrl}/functions/v1/learn-rules`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ reference_id: masterReference.id }),
        }
      )

      console.log('[ReferencesContext] Response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json()
        const errorMsg = `Edge Function error: ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}`
        console.error('[ReferencesContext] Error response:', errorData)
        throw new Error(errorMsg)
      }

      const result = await response.json()
      console.log('[ReferencesContext] Full result:', JSON.stringify(result, null, 2))
      console.log('[ReferencesContext] Result type:', result.success ? 'success' : (result.error ? 'error' : 'other'))
      console.log('[ReferencesContext] Result keys:', Object.keys(result))

      // Check if there was an error in the response
      if (result.error) {
        const errorMsg = `Unified Learning Error: ${result.error}${result.debug ? ' - ' + JSON.stringify(result.debug) : ''}`
        console.error('[ReferencesContext]', errorMsg)
        throw new Error(errorMsg)
      }

      if (!result.success) {
        console.warn('[ReferencesContext] Response was not marked as success')
      }

      console.log('[ReferencesContext] Unified learning completed')

      // Refresh references to get updated unified_template_status
      await refetch()
      console.log('[ReferencesContext] All references updated after unified learning')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[ReferencesContext] Unified learning error:', errorMessage)
      setError(errorMessage)
      throw error
    }
  }, [masterReference, refetch])

  return (
    <ReferencesContext.Provider value={{ references, masterReference, loading, error, uploadReference, updateReference, learnRules, deleteReference, refetch, triggerUnifiedLearning }}>
      {children}
    </ReferencesContext.Provider>
  )
}

export function useReferences() {
  const context = useContext(ReferencesContext)
  if (!context) {
    throw new Error('useReferences must be used within ReferencesProvider')
  }
  return context
}
