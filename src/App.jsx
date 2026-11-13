import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import BotUploadPage from './components/results/BotUploadPage'
import { AuthProvider, useAuth } from './context/AuthContext'
import { QuestionsProvider } from './context/QuestionsContext'
import { ReferencesProvider } from './context/ReferencesContext'
import { ResultsProvider } from './context/ResultsContext'
import { TemplatesProvider } from './context/TemplatesContext'
import { SolutionRulesProvider } from './context/SolutionRulesContext'
import { RuleFieldDefinitionsProvider } from './context/RuleFieldDefinitionsContext'
import { RuleValueGeneratorsProvider } from './context/RuleValueGeneratorsContext'
import { RuleTemplatesProvider } from './context/RuleTemplatesContext'
import AppShell from './components/layout/AppShell'
import QuestionnaireForm from './components/questionnaire/QuestionnaireForm'
import ResultsList from './components/results/ResultsList'
import ResultDetail from './components/ResultDetail'
import AdminLogin from './components/AdminLogin'
import QuestionManager from './components/QuestionManager'
import ReferenceManager from './components/ReferenceManager'
import TemplateManager from './components/TemplateManager'
import SolutionRulesManager from './components/SolutionRulesManager'
import RulesManagementPage from './components/admin/RulesManagementPage'
import FeedbackManager from './components/admin/FeedbackManager'
import ScenarioReferenceManager from './components/admin/ScenarioReferenceManager'
import ApiReferenceManager from './components/admin/ApiReferenceManager'
import TestersManager from './components/admin/TestersManager'
import ScenarioLibrary from './components/scenarios/ScenarioLibrary'
import ConvertPage from './components/convert/ConvertPage'
import ApiGenPage from './components/api/ApiGenPage'
import DocGenPage from './components/doc/DocGenPage'
import NlScenarioFlow from './components/nlScenario/NlScenarioFlow'
import NlpBuildPage from './components/nlp/NlpBuildPage'
import ComparePage from './components/compare/ComparePage'
import TesterLogin from './components/TesterLogin'
import PendingApproval from './components/PendingApproval'
import FeedbackButton from './components/feedback/FeedbackButton'
import VersionBadge from './components/layout/VersionBadge'
import LoadingOverlay from './components/ui/LoadingOverlay'
import { LoadingProvider } from './context/LoadingContext'
import { useLocation } from 'react-router-dom'

const ProtectedRoute = ({ element }) => {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  return isAdmin ? element : <Navigate to="/admin/login" replace />
}

// 테스터(또는 관리자) 로그인 필요 — 사용자 페이지 게이트. 미로그인 시 /login으로.
const RequireAuth = ({ element }) => {
  const { isAuthed, isApproved, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!isApproved) return <PendingApproval />
  return element
}

// /login: 이미 로그인했으면 홈으로, 아니면 로그인 화면.
const RequireAuthRedirectOrLogin = () => {
  const { isAuthed, loading } = useAuth()
  if (loading) return null
  return isAuthed ? <Navigate to="/" replace /> : <TesterLogin />
}

// 셸 래퍼 — 인증된 모든 라우트를 AppShell로 감싼다.
const ShellLayout = () => (
  <AppShell>
    <Outlet />
  </AppShell>
)

const AppContent = () => {
  const { isAdmin } = useAuth()

  return (
    <>
      <Routes>
        {/* 셸 없이 렌더 (로그인) */}
        <Route path="/login" element={<RequireAuthRedirectOrLogin />} />
        <Route
          path="/admin/login"
          element={isAdmin ? <Navigate to="/admin/questions" /> : <AdminLogin />}
        />

        {/* 사이드바 셸 안에서 렌더 */}
        <Route element={<ShellLayout />}>
          {/* 자연어로 생성이 기본값(루트), 설문으로 생성은 강화 버전(/survey) */}
          <Route path="/" element={<RequireAuth element={<NlScenarioFlow />} />} />
          <Route path="/survey" element={<RequireAuth element={<QuestionnaireForm />} />} />
          <Route path="/doc" element={<RequireAuth element={<DocGenPage />} />} />
          {/* 구 자연어 경로 → 루트로 흡수(기존 링크·북마크 호환) */}
          <Route path="/nl" element={<Navigate to="/" replace />} />
          <Route path="/results" element={<RequireAuth element={<ResultsList />} />} />
          <Route path="/results/:id" element={<RequireAuth element={<ResultDetail />} />} />
          <Route path="/scenarios" element={<RequireAuth element={<ScenarioLibrary />} />} />
          <Route path="/upload" element={<RequireAuth element={<BotUploadPage />} />} />
          <Route path="/convert" element={<RequireAuth element={<ConvertPage />} />} />
          <Route path="/api" element={<RequireAuth element={<ApiGenPage />} />} />
          <Route path="/nlp" element={<RequireAuth element={<NlpBuildPage />} />} />
          <Route path="/compare" element={<RequireAuth element={<ComparePage />} />} />

          <Route
            path="/admin"
            element={isAdmin ? <Navigate to="/admin/questions" /> : <Navigate to="/admin/login" />}
          />
          <Route
            path="/admin/questions"
            element={<ProtectedRoute element={<QuestionManager />} />}
          />
          <Route
            path="/admin/references"
            element={<ProtectedRoute element={<ReferenceManager />} />}
          />
          <Route
            path="/admin/templates"
            element={<ProtectedRoute element={<TemplateManager />} />}
          />
          <Route
            path="/admin/solution-rules"
            element={<ProtectedRoute element={<SolutionRulesManager />} />}
          />
          <Route
            path="/admin/rules"
            element={<ProtectedRoute element={<RulesManagementPage />} />}
          />
          <Route
            path="/admin/feedback"
            element={<ProtectedRoute element={<FeedbackManager />} />}
          />
          <Route
            path="/admin/scenario-references"
            element={<ProtectedRoute element={<ScenarioReferenceManager />} />}
          />
          <Route
            path="/admin/api-references"
            element={<ProtectedRoute element={<ApiReferenceManager />} />}
          />
          <Route
            path="/admin/testers"
            element={<ProtectedRoute element={<TestersManager />} />}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>

      {/* 전역 플로팅 요소 */}
      <FeedbackButton />
      <VersionBadge />
      <LoadingOverlay />
    </>
  )
}

export default function App() {
  return (
    <Router>
      <LoadingProvider>
      <AuthProvider>
        <QuestionsProvider>
          <ReferencesProvider>
            <TemplatesProvider>
              <SolutionRulesProvider>
                <RuleTemplatesProvider>
                  <RuleFieldDefinitionsProvider>
                    <RuleValueGeneratorsProvider>
                      <ResultsProvider>
                        <AppContent />
                      </ResultsProvider>
                    </RuleValueGeneratorsProvider>
                  </RuleFieldDefinitionsProvider>
                </RuleTemplatesProvider>
              </SolutionRulesProvider>
            </TemplatesProvider>
          </ReferencesProvider>
        </QuestionsProvider>
      </AuthProvider>
      </LoadingProvider>
    </Router>
  )
}
