import { createContext, useContext, useState, useCallback, useMemo } from 'react'

// 전역 로딩 오버레이 상태. 생성·추출 등 시간이 걸리는 작업 중 "생성 중…" 오버레이를 띄운다.
// useApi().request({ loadingMessage })가 중앙에서 show/hide를 호출하므로, 대부분의 생성 동작은
// 호출부에서 loadingMessage만 넘기면 자동으로 오버레이가 뜬다.
const LoadingContext = createContext(null)

// Provider 밖에서 useLoading을 호출해도 앱이 죽지 않도록 하는 no-op 폴백.
const NOOP = {
  active: false,
  message: '',
  show: () => {},
  hide: () => {},
  run: async (fn) => fn(),
}

export function LoadingProvider({ children }) {
  const [state, setState] = useState({ active: false, message: '' })

  const show = useCallback((message = '처리 중…') => setState({ active: true, message }), [])
  const hide = useCallback(() => setState({ active: false, message: '' }), [])
  const run = useCallback(async (fn, message) => {
    show(message)
    try { return await fn() } finally { hide() }
  }, [show, hide])

  const value = useMemo(
    () => ({ active: state.active, message: state.message, show, hide, run }),
    [state.active, state.message, show, hide, run],
  )

  return <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
}

export function useLoading() {
  return useContext(LoadingContext) ?? NOOP
}
