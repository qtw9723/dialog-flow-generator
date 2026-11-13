// 프로덕션 포함 모든 화면 우상단에 항상 표시되는 버전 배지.
// 버전 값은 vite.config.js가 package.json에서 주입한 __APP_VERSION__(SemVer 동결 기준).
// DEV 테이블 모드(VITE_DEV_TABLES=true)면 배지에 DEV를 붙여 dev_ 테이블 대상임을 표시.
// 좌하단(사이드바 푸터)·우하단(피드백 버튼)이 이미 점유돼 우상단에 배치한다.
import { DEV_TABLES } from '../../lib/constants'

const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

export default function VersionBadge() {
  return (
    <span
      className={`fixed top-3 right-3 z-40 select-none rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm ring-1 backdrop-blur pointer-events-none ${
        DEV_TABLES
          ? 'bg-amber-100/90 text-amber-700 ring-amber-300'
          : 'bg-white/70 text-slate-400 ring-slate-200'
      }`}
      title={`DialogFlow Generator v${VERSION}${DEV_TABLES ? ' — DEV 테이블 모드' : ''}`}
    >
      v{VERSION}{DEV_TABLES ? ' DEV' : ''}
    </span>
  )
}
