import {
  PenLine,
  ClipboardList,
  FileText,
  Library,
  FileOutput,
  FileJson,
  LayoutList,
  Settings2,
  Upload,
  MessagesSquare,
  FileDiff,
} from 'lucide-react'

// 단독 상단 항목 (그룹 없음)
export const topItems = [
  { label: '생성 결과', path: '/results', icon: LayoutList },
]

// 그룹형 네비 항목
export const navGroups = [
  {
    label: '생성',
    items: [
      // 자연어로 생성이 기본값(루트 /), 설문으로 생성은 강화 버전(/survey)
      { label: '자연어로 생성', path: '/', icon: PenLine },
      { label: '설문으로 생성', path: '/survey', icon: ClipboardList },
      { label: '문서로 생성', path: '/doc', icon: FileText },
      { label: '라이브러리 조합', path: '/scenarios', icon: Library },
      { label: '기존 챗봇 올리기', path: '/upload', icon: Upload },
    ],
  },
  {
    label: '부가 도구',
    items: [
      { label: '문서 → ESD 생성', path: '/convert', icon: FileOutput },
      { label: '문서 → API 생성', path: '/api', icon: FileJson },
      { label: 'NLP 만들기', path: '/nlp', icon: MessagesSquare },
      { label: '데이터 비교', path: '/compare', icon: FileDiff },
    ],
  },
]

// 하단 항목 (adminOnly: true 항목은 관리자만 표시)
export const bottomItems = [
  { label: '관리', path: '/admin/questions', icon: Settings2, adminOnly: true },
]
