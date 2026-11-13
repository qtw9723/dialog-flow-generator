// node_modules 설치 완주 가드 — dev/build 전에 자동 실행(package.json의 predev/prebuild).
//
// 배경(2026-07-09): 릴리스 사이클마다 자동화가 npm install/ci를 돌리다 타임아웃 등으로
// 중간에 죽으면 node_modules가 "폴더는 있으나 vite 등 핵심 패키지 누락" 상태로 남았다.
// `[ -d node_modules ]` 같은 폴더 존재 체크는 이 반쪽 상태를 "설치됨"으로 오판해
// 다음 `npm run dev`가 `sh: vite: command not found`로 실패했다.
//
// npm은 설치를 완전히 마쳤을 때만 node_modules/.package-lock.json을 남긴다.
// 이 마커(+ 실제 vite 바이너리) 부재를 "미완주"로 보고, npm ci로 클린 재설치해 자가 치유한다.
// (npm ci는 시작 시 node_modules를 통째로 지우고 lockfile 기준으로 다시 설치하므로
//  반쪽 상태가 남지 않는다.)

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const COMPLETE_MARKER = 'node_modules/.package-lock.json';
const VITE_BIN = 'node_modules/.bin/vite';

if (existsSync(COMPLETE_MARKER) && existsSync(VITE_BIN)) {
  process.exit(0); // 정상 완주 상태 — 빠르게 통과
}

console.warn('[ensure-deps] node_modules가 불완전합니다(설치 미완주 흔적). npm ci로 클린 재설치합니다…');
try {
  execSync('npm ci', { stdio: 'inherit' });
} catch (err) {
  console.error('[ensure-deps] npm ci 실패. 수동으로 `rm -rf node_modules && npm ci`를 실행하세요.');
  process.exit(1);
}
