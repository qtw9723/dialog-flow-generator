// 버튼 variant 클래스 표 (의존성 0).
//
// ⚠ 왜 Button.jsx에서 분리했나: Button.jsx는 `@/lib/utils` 별칭과 `cva`(npm)를 import해서
//    Deno 테스트가 로드할 수 없다(2026-10-07 실측). 표를 여기 두면 테스트가 붙는다.
//    선례: src/lib/solutionRuleCategories.js가 constants.js에서 분리된 사유와 같다.
// ⚠ 이 파일에 import를 추가하지 마라. 추가하는 순간 테스트가 로드하지 못한다.

export const BUTTON_BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"

export const BUTTON_VARIANTS = {
  default: "bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700",
  secondary: "bg-[#E5E7EB] text-[#1F2937] hover:bg-[#D1D5DB]",
  outline: "border border-[#E5E7EB] bg-white text-[#1F2937] hover:bg-[#F8FAFC]",
  ghost: "text-[#1F2937] hover:bg-[#F8FAFC]",
  danger: "bg-[#EF4444] text-white hover:bg-[#DC2626] active:bg-[#B91C1C]",
  // 로컬 BTN_OUTLINE(파란 테두리)의 모양을 보존하는 variant. Task 3이 쓴다.
  outlinePrimary: "border border-primary-500 text-primary-500 bg-white hover:bg-primary-50",
}

export const BUTTON_SIZES = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
}
