import { PocDocGenerateFlow } from '../pocDoc/PocDocGenerateFlow'

// 생성: 문서로 생성.
// 설문 화면 안의 POC 문서 모달과 "동일한" 흐름 컴포넌트(PocDocGenerateFlow)를 그대로 재사용한다(복제 금지).
// onBack을 넘기지 않으면 뒤로가기·취소 버튼이 숨겨져 사이드바로 진입하는 독립 페이지에 맞는 형태가 된다.
// (설문 화면의 모달은 onBack을 넘겨 기존과 동일하게 동작 — 두 입구가 같은 기능을 공유.)
export default function DocGenPage() {
  return <PocDocGenerateFlow />
}
