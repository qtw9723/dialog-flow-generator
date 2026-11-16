import { createClient } from '@supabase/supabase-js'
import { demoSupabase } from '../demo/demoBackend'

// 데모 빌드(VITE_DEMO=true)에서는 Supabase 대신 브라우저 안의 모의 백엔드를 쓴다(src/demo/).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = import.meta.env.VITE_DEMO === 'true'
  ? demoSupabase
  : createClient(supabaseUrl, supabaseAnonKey)
