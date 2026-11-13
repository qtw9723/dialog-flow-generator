import { toCanvas } from 'html-to-image'

// 캡처 캔버스에서 뷰포트 영역의 소스 사각형 계산(순수 — deno 테스트 대상).
// ratio = 캔버스 실측 폭 / 페이지 폭 — devicePixelRatio·라이브러리 배율을 하드코딩 없이 역산.
export function viewportCropRect({ scrollX, scrollY, innerWidth, innerHeight, canvasWidth, canvasHeight, pageWidth }) {
  const ratio = pageWidth > 0 ? canvasWidth / pageWidth : 1
  const sx = Math.max(0, Math.min(scrollX * ratio, canvasWidth - 1))
  const sy = Math.max(0, Math.min(scrollY * ratio, canvasHeight - 1))
  const sw = Math.max(1, Math.min(innerWidth * ratio, canvasWidth - sx))
  const sh = Math.max(1, Math.min(innerHeight * ratio, canvasHeight - sy))
  return { sx, sy, sw, sh }
}

const BASE64_LIMIT = 1_500_000

// 현재 뷰포트를 JPEG data URL로 캡처(피드백 UI 제외). 실패·과대 시 null — best-effort.
export async function captureViewport() {
  try {
    const make = async (pixelRatio) => {
      const canvas = await toCanvas(document.body, {
        pixelRatio,
        filter: (node) => !(node instanceof Element && node.closest('[data-feedback-ui]')),
      })
      const { sx, sy, sw, sh } = viewportCropRect({
        scrollX: window.scrollX, scrollY: window.scrollY,
        innerWidth: window.innerWidth, innerHeight: window.innerHeight,
        canvasWidth: canvas.width, canvasHeight: canvas.height,
        pageWidth: document.body.scrollWidth,
      })
      const out = document.createElement('canvas')
      out.width = sw; out.height = sh
      out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
      return out.toDataURL('image/jpeg', 0.75)
    }
    let url = await make(1)
    if (url.length > BASE64_LIMIT) url = await make(0.6)
    return url.length > BASE64_LIMIT ? null : url
  } catch (e) {
    console.warn('[captureViewport] 캡처 실패:', e)
    return null
  }
}
