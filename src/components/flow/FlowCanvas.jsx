import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isEditableType } from '../../lib/flow/nodeTypeRegistry.js'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  Panel,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'
import './flowCanvas.css'
import { toPng } from 'html-to-image'
import { Download, Maximize2, X } from 'lucide-react'
import { deriveStructure, deriveUserFlow, conditionLabel } from '../../lib/refDiagram.js'
import { seedEdgeVisual } from '../../lib/flow/edgeSeed.js'
import { shapeForType } from '../../lib/nodeShape.js'
import { canvasToFlow } from '../../lib/flow/canvasToFlow.js'
import { writeNodeConfig } from '../../lib/flow/nodeConfig.js'
import { readLoopBody } from '../../lib/flow/loopBody.js'

// 편집 모드에서 커스텀 노드(반복 박스 등)가 '내용 편집' 진입을 부모에 요청하기 위한 컨텍스트.
// { editable:boolean, onEdit:(nodeId)=>void }. 선택 불가한 loopGroup은 헤더 ⚙ 버튼으로 이걸 호출한다.
const NodeEditContext = createContext(null)

// ─── 타입별 색상 (안내/입력/분기/반복/AI응답/API/기록저장) ────────────────
const TYPE_COLORS = {
  output:    { bg: '#EFF6FF', border: '#3B82F6', badgeBg: '#DBEAFE', badgeText: '#1E40AF' },
  input:     { bg: '#F0FDF4', border: '#22C55E', badgeBg: '#DCFCE7', badgeText: '#166534' },
  set:       { bg: '#FEFCE8', border: '#EAB308', badgeBg: '#FEF9C3', badgeText: '#854D0E' },
  node:      { bg: '#FFF7ED', border: '#F97316', badgeBg: '#FFEDD5', badgeText: '#9A3412' },
  condition: { bg: '#FFF7ED', border: '#F97316', badgeBg: '#FFEDD5', badgeText: '#9A3412' },
  subflow: { bg: '#F5F3FF', border: '#8B5CF6', badgeBg: '#EDE9FE', badgeText: '#5B21B6' },
  llmchat:   { bg: '#FDF2F8', border: '#EC4899', badgeBg: '#FCE7F3', badgeText: '#9D174D' },
  api:       { bg: '#ECFDF5', border: '#10B981', badgeBg: '#D1FAE5', badgeText: '#064E3B' },
  esd:       { bg: '#FFF1F2', border: '#F43F5E', badgeBg: '#FFE4E6', badgeText: '#9F1239' },
}
const DEFAULT_COLOR = { bg: '#F9FAFB', border: '#9CA3AF', badgeBg: '#F3F4F6', badgeText: '#374151' }

const NODE_W = 190
const NODE_H = 88
const PAD = 28
const TITLE_H = 46
const COL_GAP = 56
const LOOP_PAD = 16     // 반복 박스 내부 여백
const LOOP_TITLE = 32   // 반복 박스 헤더 높이
const LOOP_VGAP = 46    // 반복 본문 노드 세로 간격(응답 대기 배지 들어갈 여유)

// ─── 도형별 콘텐츠 여백(라벨 영역이 도형 밖으로 새지 않게) ────────────────
const SHAPE_PAD = {
  rounded: '8px 12px',
  ai: '8px 12px',
  rect: '8px 12px',
  parallelogram: '8px 20px 8px 26px',
  diamond: '10px 36px',
  hexagon: '8px 28px',
  cylinder: '20px 14px 10px',
  double: '8px 18px',
}

// ─── 배경 도형(인라인 SVG) — 타입별 표준 플로우차트 도형 ──────────────────
function ShapeBg({ shape, color, w, h, selected = false }) {
  const m = 3
  const skew = Math.min(18, w * 0.14)   // 평행사변형 기울기
  const hx = Math.min(22, w * 0.16)     // 육각형 좌우 노치
  const bar = Math.min(9, w * 0.08)     // 이중테두리 안쪽 선 간격
  // 선택 시 엣지와 동일하게 브랜드색·굵은 테두리로 강조(도형 자체가 강조돼 형태 무관하게 보인다)
  const strokeColor = selected ? '#0052CC' : color.border
  const strokeW = selected ? 3 : 2
  const fillStroke = { fill: color.bg, stroke: strokeColor, strokeWidth: strokeW }
  const lineStroke = { fill: 'none', stroke: strokeColor, strokeWidth: strokeW }
  const svgFilter = selected
    ? 'drop-shadow(0 0 3px rgba(0,82,204,0.5))'
    : 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', filter: svgFilter }}>
      {shape === 'parallelogram' && (
        <polygon points={`${m + skew},${m} ${w - m},${m} ${w - m - skew},${h - m} ${m},${h - m}`} {...fillStroke} strokeLinejoin="round" />
      )}
      {shape === 'diamond' && (
        <polygon points={`${w / 2},${m} ${w - m},${h / 2} ${w / 2},${h - m} ${m},${h / 2}`} {...fillStroke} strokeLinejoin="round" />
      )}
      {shape === 'hexagon' && (
        <polygon points={`${m + hx},${m} ${w - m - hx},${m} ${w - m},${h / 2} ${w - m - hx},${h - m} ${m + hx},${h - m} ${m},${h / 2}`} {...fillStroke} strokeLinejoin="round" />
      )}
      {shape === 'cylinder' && (() => {
        const rx = (w - 2 * m) / 2, ry = Math.min(9, (h - 2 * m) / 3), cx = w / 2
        return (
          <>
            <path d={`M ${m} ${m + ry} A ${rx} ${ry} 0 0 0 ${w - m} ${m + ry} L ${w - m} ${h - m - ry} A ${rx} ${ry} 0 0 1 ${m} ${h - m - ry} Z`} {...fillStroke} />
            <ellipse cx={cx} cy={m + ry} rx={rx} ry={ry} {...fillStroke} />
          </>
        )
      })()}
      {shape === 'double' && (
        <>
          <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx={4} {...fillStroke} />
          <line x1={m + bar} y1={m} x2={m + bar} y2={h - m} {...lineStroke} />
          <line x1={w - m - bar} y1={m} x2={w - m - bar} y2={h - m} {...lineStroke} />
        </>
      )}
      {(shape === 'rounded' || shape === 'ai') && (
        <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx={14} {...fillStroke} />
      )}
      {shape === 'rect' && (
        <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx={3} {...fillStroke} />
      )}
    </svg>
  )
}

// ─── 커스텀 노드: 구조 노드 (도형 + 라벨 2줄 + 호버 툴팁) ──────────────────
function StructureNode({ data, selected }) {
  const c = TYPE_COLORS[data.type] || DEFAULT_COLOR
  const shape = shapeForType(data.type)
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', width: NODE_W, height: NODE_H, cursor: 'grab' }}
    >
      <Handle type="target" position={Position.Top} style={{ background: c.border, width: 8, height: 8, top: -4, zIndex: 3 }} />
      <ShapeBg shape={shape} color={c} w={NODE_W} h={NODE_H} selected={selected} />
      {/* 콘텐츠 (도형 위에 겹쳐 배치) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: SHAPE_PAD[shape] || '8px 12px',
          textAlign: 'center',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: 10,
            background: c.badgeBg,
            color: c.badgeText,
            borderRadius: 4,
            padding: '1px 6px',
            fontWeight: 700,
            letterSpacing: 0.2,
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          {shape === 'ai' && <span style={{ color: c.border }}>✦</span>}
          {data.kindKo}
        </span>
        <span
          style={{
            fontSize: 12,
            color: '#1F2937',
            fontWeight: 500,
            lineHeight: 1.25,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {data.label}
        </span>
        {data.entryCondition && (
          <span
            style={{
              fontSize: 9,
              color: '#6B7280',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={data.entryCondition}
          >
            {data.entryCondition}
          </span>
        )}
      </div>
      {/* 호버 시 전문 툴팁 */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 7px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1F2937',
            color: '#fff',
            fontSize: 12,
            lineHeight: 1.4,
            padding: '6px 10px',
            borderRadius: 6,
            maxWidth: 260,
            width: 'max-content',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <span style={{ opacity: 0.65, marginRight: 6 }}>{data.kindKo}</span>
          {data.label}
          {data.entryCondition && (
            <div
              style={{
                marginTop: 4,
                paddingTop: 4,
                borderTop: '1px solid rgba(255,255,255,0.2)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11,
                color: 'rgba(255,255,255,0.75)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {data.entryCondition}
            </div>
          )}
          <span
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid #1F2937',
            }}
          />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: c.border, width: 8, height: 8, bottom: -4, zIndex: 3 }} />
    </div>
  )
}

// ─── 커스텀 노드: 시나리오 그룹 배경 ─────────────────────────────────────
function ScenarioGroupNode({ data }) {
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        border: '2px dashed #CBD5E1',
        borderRadius: 12,
        background: 'rgba(248, 250, 252, 0.85)',
        boxSizing: 'border-box',
        // 본문(빈 영역) 드래그는 뒤의 캔버스 pane으로 통과 → 화면 패닝. 헤더만 예외.
        pointerEvents: 'none',
      }}
    >
      {/* 헤더만 드래그 핸들 — 이 요소를 잡아야 그룹이 움직임(dragHandle 셀렉터와 일치) */}
      <div
        className="scenario-drag-handle"
        title="헤더를 드래그해 시나리오를 이동"
        style={{
          padding: '10px 16px',
          fontSize: 12,
          fontWeight: 700,
          color: '#374151',
          letterSpacing: 0.1,
          height: TITLE_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          borderBottom: '1px solid #E5E7EB',
          background: 'rgba(241, 245, 249, 0.9)',
          borderRadius: '10px 10px 0 0',
          cursor: 'grab',
          pointerEvents: 'auto',  // 헤더는 드래그 가능(그룹 이동)
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <span style={{ color: '#94A3B8', fontSize: 13 }}>⠿</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.label}</span>
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, color: '#94A3B8', whiteSpace: 'nowrap' }}>헤더 드래그</span>
      </div>
    </div>
  )
}

// ─── 커스텀 노드: 반복(loop) 구획 — 본문을 담는 박스 ─────────────────────
function LoopGroupNode({ id, data }) {
  const c = TYPE_COLORS.subflow
  const editCtx = useContext(NodeEditContext)
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        border: `2px solid ${c.border}`,
        borderRadius: 10,
        background: '#FCFBFF',
        boxSizing: 'border-box',
        position: 'relative',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        // 빈 영역 드래그는 캔버스 pane으로 통과 → 패닝(본문 노드는 별도 레이어)
        pointerEvents: 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: c.border, width: 8, height: 8, top: -4, zIndex: 4 }} />
      {/* 헤더가 드래그 핸들 — 잡으면 반복 박스 이동(시나리오 박스 안에서만) */}
      <div
        className="loop-drag-handle"
        title="헤더를 드래그해 반복 박스 이동"
        style={{
          height: LOOP_TITLE,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          background: c.badgeBg,
          borderBottom: `1px solid ${c.border}`,
          borderRadius: '8px 8px 0 0',
          fontSize: 11,
          fontWeight: 700,
          color: c.badgeText,
          cursor: 'grab',
          pointerEvents: 'auto',   // 박스 배경은 통과(패닝)하되 헤더는 드래그 가능
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>🔁 반복</span>
        {data.label && (
          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            · {data.label}
          </span>
        )}
        {data.maxCount && (
          <span style={{ marginLeft: 'auto', fontWeight: 500, opacity: 0.85, whiteSpace: 'nowrap' }}>최대 {data.maxCount}회</span>
        )}
        {editCtx?.editable && (
          <button
            className="nodrag nopan"
            title="반복 설정·본문 편집"
            onClick={(e) => { e.stopPropagation(); editCtx.onEdit(id) }}
            style={{
              marginLeft: data.maxCount ? 8 : 'auto', flexShrink: 0,
              border: `1px solid ${c.border}`, background: '#fff', color: c.badgeText,
              borderRadius: 5, padding: '1px 6px', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', pointerEvents: 'auto',
            }}
          >⚙ 편집</button>
        )}
      </div>
      {editCtx?.editable && (
        <div style={{ padding: '8px 12px', fontSize: 11, color: c.badgeText, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>↻</span>
          본문 {data.bodyCount || 0}단계 — <b>⚙ 편집</b>에서 관리
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: c.border, width: 8, height: 8, bottom: -4, zIndex: 4 }} />
    </div>
  )
}

const nodeTypes = {
  structureNode: StructureNode,
  scenarioGroup: ScenarioGroupNode,
  loopGroup: LoopGroupNode,
}

// ─── 커스텀 엣지: 분기 조건 라벨 (길면 말줄임 + 호버 시 전문 툴팁) ──────────
function BranchEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style }) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  // 라벨은 두 노드 사이(랭크 간 빈 공간) 정중앙에 — 경로 자동 라벨좌표는 L자에서 노드에 겹칠 수 있음
  const labelX = (sourceX + targetX) / 2
  const labelY = (sourceY + targetY) / 2
  const [hovered, setHovered] = useState(false)
  const full = data?.label || ''
  const warn = !!data?.warn
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {full && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 20,
              cursor: 'default',
            }}
          >
            <div
              style={{
                maxWidth: 150,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                background: warn ? '#FEF2F2' : '#fff',
                border: `1px solid ${warn ? '#FCA5A5' : '#E5E7EB'}`,
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 11,
                fontWeight: warn ? 700 : 500,
                color: warn ? '#B91C1C' : '#374151',
              }}
            >
              {full}
            </div>
            {hovered && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#1F2937',
                  color: '#fff',
                  fontSize: 12,
                  lineHeight: 1.4,
                  padding: '6px 10px',
                  borderRadius: 6,
                  maxWidth: 320,
                  width: 'max-content',
                  wordBreak: 'break-word',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                  zIndex: 30,
                }}
              >
                {full}
                <span
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop: '5px solid #1F2937',
                  }}
                />
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// ─── 커스텀 엣지: 사용자 응답 대기 — 엣지 중앙에 눈에 띄는 ⏳ 배지 ──────────
function WaitEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const labelX = (sourceX + targetX) / 2
  const labelY = (sourceY + targetY) / 2
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          title="사용자 응답 대기"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            display: 'flex', alignItems: 'center', gap: 4,
            background: '#EFF6FF', border: '1.5px solid #60A5FA', borderRadius: 11,
            padding: '1px 8px 1px 6px', height: 22, boxSizing: 'border-box',
            fontSize: 11, fontWeight: 600, color: '#1D4ED8', whiteSpace: 'nowrap',
            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            pointerEvents: 'all', zIndex: 20,
          }}
        >
          ⏳ 응답 대기
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const edgeTypes = { branchEdge: BranchEdge, waitEdge: WaitEdge }


// ─── 범례 (도형 ↔ 의미) ──────────────────────────────────────────────────
const LEGEND_ITEMS = [
  { type: 'output', ko: '안내' },
  { type: 'input', ko: '입력' },
  { type: 'node', ko: '분기' },
  { type: 'set', ko: '저장' },
  { type: 'subflow', ko: '반복' },
  { type: 'llmchat', ko: 'AI 응답' },
  { type: 'api', ko: 'API 연동' },
  { type: 'esd', ko: '기록 저장' },
]

function Legend() {
  const [collapsed, setCollapsed] = useState(true)  // 초기값: 닫힘
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        padding: collapsed ? '6px 10px' : '8px 11px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        fontSize: 11,
        userSelect: 'none',
      }}
    >
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? '범례 펼치기' : '범례 접기'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 700,
          color: '#374151',
          marginBottom: collapsed ? 0 : 7,
        }}
      >
        <span style={{ fontSize: 9, color: '#94A3B8', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
        범례
      </button>
      {!collapsed && (
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 16, rowGap: 7 }}>
        {LEGEND_ITEMS.map((item) => {
          const c = TYPE_COLORS[item.type] || DEFAULT_COLOR
          const shape = shapeForType(item.type)
          return (
            <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ position: 'relative', width: 40, height: 24, flexShrink: 0 }}>
                {item.type === 'subflow' ? (
                  // 반복은 노드 도형이 아니라 '구획(박스)' — 미니 박스로 표시
                  <div style={{ width: 40, height: 24, border: `2px solid ${c.border}`, borderRadius: 5, background: '#FCFBFF', boxSizing: 'border-box', overflow: 'hidden' }}>
                    <div style={{ height: 8, background: c.badgeBg, borderBottom: `1px solid ${c.border}` }} />
                  </div>
                ) : (
                  <>
                    <ShapeBg shape={shape} color={c} w={40} h={24} />
                    {shape === 'ai' && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.border, fontSize: 11, fontWeight: 700 }}>✦</span>
                    )}
                  </>
                )}
              </div>
              <span style={{ color: '#374151' }}>{item.ko}</span>
            </div>
          )
        })}
      </div>
      )}
      {!collapsed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, paddingTop: 7, borderTop: '1px solid #F1F5F9' }}>
          <span style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3,
            background: '#EFF6FF', border: '1.5px solid #60A5FA', borderRadius: 10,
            padding: '0 6px', height: 18, fontSize: 10, fontWeight: 600, color: '#1D4ED8',
          }}>
            ⏳ 응답 대기
          </span>
          <span style={{ color: '#374151' }}>봇 응답 후 사용자 응답을 기다림</span>
        </div>
      )}
    </div>
  )
}

// ─── dagre 레이아웃 계산 ─────────────────────────────────────────────────
function buildLayout(structure, { readOnly = true } = {}) {
  const { scenarios, nodes, edges, loops = [] } = structure
  if (!scenarios.length) return { rfNodes: [], rfEdges: [] }

  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const rfNodes = []
  const rfEdges = []
  let xOffset = 0

  // 봇 응답(output/llmchat) 다음 엣지 = 턴 경계(사용자 응답 대기)
  const isTurnBoundary = (from) => {
    const t = nodeById.get(from)?.type
    return t === 'output' || t === 'llmchat'
  }

  // 엣지 시드 — 타입·라벨·조건은 seedEdgeVisual(순수)이 정한다.
  // data.condition은 조건 편집기의 시드 소스이자 canvasToFlow의 입력이라 반드시 실어야 한다.
  const pushEdge = (from, to, { condition = '', isBranch = false, turn = false, targetLabel = '', emptyCount = 0 } = {}) => {
    const { type, data } = seedEdgeVisual({ condition, isBranch, turn, readOnly, targetLabel, emptyCount })
    const edge = {
      id: `e-${from}-${to}`,
      source: from,
      target: to,
      // 편집 모드에선 선택·삭제 가능(기존 연결 끊기). 읽기전용에선 잠금.
      deletable: !readOnly,
      focusable: !readOnly,
      style: { stroke: turn ? '#60A5FA' : '#9CA3AF', strokeWidth: 1.5 },
      type,
    }
    if (data) edge.data = data
    rfEdges.push(edge)
  }

  // 분기 판정용 — 출발 노드별 나가는 수(2개 이상이면 분기)와 조건 없는 갈래 수(1개면 else).
  const outDeg = {}
  const emptyDeg = {}
  for (const e of edges) {
    outDeg[e.from] = (outDeg[e.from] || 0) + 1
    if (!String(e.condition || '').trim()) emptyDeg[e.from] = (emptyDeg[e.from] || 0) + 1
  }

  for (const scenario of scenarios) {
    const snIds = new Set(scenario.nodeIds)

    // 이 시나리오의 반복(loop) — 본문은 박스 안, subflow는 박스로 렌더
    const scLoops = loops.filter(l => snIds.has(l.id))
    const loopMeta = new Map(scLoops.map(l => [l.id, l]))
    const bodySet = new Set()
    for (const l of scLoops) for (const b of l.bodyIds) bodySet.add(b)

    // 반복 박스 크기 — 본문도 dagre로 배치(갈래가 나란히 놓여 엣지가 노드를 건너뛰지 않게)
    const loopBox = new Map() // loopId -> { w, h, bodyPos: Map }
    for (const l of scLoops) {
      // 편집 모드: 본문은 반복 편집기(⚙)에서 관리 — 박스 안에 본문 노드를 렌더하지 않고 요약만.
      if (!readOnly) {
        loopBox.set(l.id, { w: NODE_W + LOOP_PAD * 2, h: LOOP_TITLE + 44, bodyPos: new Map() })
        continue
      }
      const bg = new dagre.graphlib.Graph()
      bg.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: LOOP_VGAP })
      bg.setDefaultEdgeLabel(() => ({}))
      const bset = new Set(l.bodyIds)
      for (const bid of l.bodyIds) bg.setNode(bid, { width: NODE_W, height: NODE_H })
      for (const be of (l.bodyEdges || [])) {
        if (bset.has(be.from) && bset.has(be.to)) bg.setEdge(be.from, be.to)
      }
      if (l.bodyIds.length) dagre.layout(bg)

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const bid of l.bodyIds) {
        const p = bg.node(bid); if (!p) continue
        minX = Math.min(minX, p.x - NODE_W / 2); minY = Math.min(minY, p.y - NODE_H / 2)
        maxX = Math.max(maxX, p.x + NODE_W / 2); maxY = Math.max(maxY, p.y + NODE_H / 2)
      }
      if (!isFinite(minX)) { minX = 0; minY = 0; maxX = NODE_W; maxY = NODE_H }

      const bodyPos = new Map()
      for (const bid of l.bodyIds) {
        const p = bg.node(bid); if (!p) continue
        bodyPos.set(bid, {
          x: LOOP_PAD + (p.x - NODE_W / 2 - minX),
          y: LOOP_TITLE + LOOP_PAD + (p.y - NODE_H / 2 - minY),
        })
      }
      loopBox.set(l.id, {
        w: (maxX - minX) + LOOP_PAD * 2,
        h: LOOP_TITLE + (maxY - minY) + LOOP_PAD * 2,
        bodyPos,
      })
    }

    // 메인 레이아웃 대상 = 시나리오 노드 중 본문 제외(subflow은 박스로 포함)
    const mainIds = scenario.nodeIds.filter(id => !bodySet.has(id))
    const sizeOf = (id) => loopBox.has(id)
      ? { w: loopBox.get(id).w, h: loopBox.get(id).h }
      : { w: NODE_W, h: NODE_H }

    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 84 })  // 응답 대기 배지·분기 조건 라벨이 노드에 겹치지 않게 랭크 간격 확보
    g.setDefaultEdgeLabel(() => ({}))

    for (const id of mainIds) { const s = sizeOf(id); g.setNode(id, { width: s.w, height: s.h }) }
    for (const e of edges) {
      if (snIds.has(e.from) && snIds.has(e.to) && !bodySet.has(e.from) && !bodySet.has(e.to)) g.setEdge(e.from, e.to)
    }
    if (mainIds.length > 0) dagre.layout(g)

    let maxX = NODE_W + PAD, maxY = NODE_H + PAD
    for (const id of mainIds) {
      const p = g.node(id); if (!p) continue
      const s = sizeOf(id)
      maxX = Math.max(maxX, p.x + s.w / 2)
      maxY = Math.max(maxY, p.y + s.h / 2)
    }

    const gw = maxX + PAD * 2
    const gh = maxY + PAD + TITLE_H

    // 시나리오 그룹 (부모는 자식보다 배열에서 앞) — 헤더로만 드래그
    const groupId = `_g_${scenario.rootId}`
    rfNodes.push({
      id: groupId,
      type: 'scenarioGroup',
      position: { x: xOffset, y: 0 },
      width: gw, height: gh,
      // 노드 wrapper까지 pointerEvents:none → 빈 영역 드래그가 pane으로 통과(패닝). 헤더(자식 auto)는 여전히 드래그 가능.
      style: { width: gw, height: gh, zIndex: 0, pointerEvents: 'none' },
      data: { label: scenario.name || scenario.title, width: gw, height: gh },
      draggable: true,
      dragHandle: '.scenario-drag-handle',
      selectable: false,
      focusable: false,
      deletable: false,
    })

    // 본체 노드(구조 노드 + 반복 박스) — 그룹의 자식(상대좌표), 박스 밖 이탈 금지
    for (const id of mainIds) {
      const p = g.node(id); if (!p) continue
      const s = sizeOf(id)
      const x = PAD + p.x - s.w / 2
      const y = TITLE_H + PAD / 2 + p.y - s.h / 2
      if (loopBox.has(id)) {
        const box = loopBox.get(id)
        const ln = loopMeta.get(id)
        rfNodes.push({
          id,
          type: 'loopGroup',
          parentId: groupId,
          extent: 'parent',
          position: { x, y },
          width: box.w, height: box.h,
          // wrapper pointerEvents:none → 박스 빈 영역 드래그는 pane 통과(패닝). 헤더(자식 auto)는 드래그 핸들.
          style: { width: box.w, height: box.h, zIndex: 1, pointerEvents: 'none' },
          data: { label: nodeById.get(id)?.label || '', maxCount: ln?.maxCount || null, bodyCount: (ln?.bodyIds || []).length, width: box.w, height: box.h },
          draggable: true,                 // 반복 박스 이동(헤더만) — extent:'parent'로 시나리오 박스 안에서만
          dragHandle: '.loop-drag-handle',
          selectable: false,
          deletable: false,
        })
      } else {
        rfNodes.push({
          id,
          type: 'structureNode',
          parentId: groupId,
          extent: 'parent',
          position: { x, y },
          data: nodeById.get(id),
          draggable: true,
          deletable: !readOnly,
        })
      }
    }

    // 반복 본문 노드 — 박스(loopGroup)의 자식 (편집 모드에선 숨김 — 반복 편집기가 관리)
    for (const l of (readOnly ? scLoops : [])) {
      const box = loopBox.get(l.id)
      for (const bid of l.bodyIds) {
        const pos = box.bodyPos.get(bid)
        if (!pos || !nodeById.has(bid)) continue
        rfNodes.push({
          id: bid,
          type: 'structureNode',
          parentId: l.id,
          extent: 'parent',
          position: { x: pos.x, y: pos.y },
          data: nodeById.get(bid),
          draggable: true,
          deletable: false,
        })
      }
    }

    xOffset += gw + COL_GAP
  }

  // 메인 엣지 — 분기(출력 2개 이상)엔 실제 조건 라벨. 봇 응답 뒤 비분기 턴 경계엔 ⏳ 응답 대기 배지.
  for (const e of edges) {
    pushEdge(e.from, e.to, {
      condition: e.condition,
      isBranch: (outDeg[e.from] || 0) >= 2,
      turn: isTurnBoundary(e.from),
      targetLabel: e.label,
      emptyCount: emptyDeg[e.from] || 0,
    })
  }

  // 반복 본문 내부 엣지 — 분기(2갈래+)엔 실제 조건 라벨, 비분기 턴 경계엔 ⏳ 응답 대기 배지
  //   (편집 모드에선 본문을 숨기므로 본문 엣지도 렌더하지 않음)
  for (const l of (readOnly ? loops : [])) {
    const bodyOut = {}
    const bodyEmpty = {}
    for (const be of (l.bodyEdges || [])) {
      bodyOut[be.from] = (bodyOut[be.from] || 0) + 1
      if (!String(be.condition || '').trim()) bodyEmpty[be.from] = (bodyEmpty[be.from] || 0) + 1
    }
    for (const be of (l.bodyEdges || [])) {
      pushEdge(be.from, be.to, {
        condition: be.condition,
        isBranch: (bodyOut[be.from] || 0) >= 2,
        turn: isTurnBoundary(be.from),
        targetLabel: be.label,
        emptyCount: bodyEmpty[be.from] || 0,
      })
    }
  }

  return { rfNodes, rfEdges }
}

// ─── 뷰 토글 버튼 ────────────────────────────────────────────────────────
function ViewToggle({ view, onChange }) {
  const btn = (v, label) => (
    <button
      onClick={() => onChange(v)}
      style={{
        padding: '6px 16px',
        fontSize: 13,
        fontWeight: 500,
        color: view === v ? '#fff' : '#374151',
        background: view === v ? 'var(--color-primary-500)' : '#fff',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
        outline: 'none',
      }}
    >
      {label}
    </button>
  )
  return (
    <div
      style={{
        display: 'inline-flex',
        borderRadius: 8,
        border: '1px solid #E5E7EB',
        overflow: 'hidden',
      }}
    >
      {btn('structure', '구조 다이어그램')}
      <div style={{ width: 1, background: '#E5E7EB' }} />
      {btn('userflow', '사용자 흐름도')}
    </div>
  )
}

// ─── 사용자 흐름도 뷰 ────────────────────────────────────────────────────
function UserFlowView({ flowJson, contentRef, scenarioNames }) {
  const userFlow = useMemo(() => deriveUserFlow(flowJson || {}, { scenarioNames }), [flowJson, scenarioNames])

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: '#ffffff' }}>
      <div
        ref={contentRef}
        style={{
          padding: '32px 40px',
          minWidth: 560,
          background: '#ffffff',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {/* 문서형 헤더 + 범례 */}
        <div style={{ marginBottom: 28, borderBottom: '3px solid var(--color-primary-500)', paddingBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1F2937', marginBottom: 12 }}>
            사용자 흐름도
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-primary-500)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#6B7280' }}>사용자</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6B7280', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#6B7280' }}>봇</span>
            </div>
          </div>
        </div>

        {userFlow.scenarios.length === 0 && (
          <div style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
            표시할 흐름이 없습니다.
          </div>
        )}

        {userFlow.scenarios.map((scenario, si) => (
          <div key={si} style={{ marginBottom: 36 }}>
            {/* 시나리오 레이블 + 제목 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                background: 'var(--color-primary-500)',
                borderRadius: 4,
                padding: '2px 8px',
                letterSpacing: 0.5,
                flexShrink: 0,
              }}>
                시나리오 {si + 1}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>
                {scenario.name || scenario.title}
              </span>
            </div>

            {/* 단계 목록 (세로) */}
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
              {scenario.steps.length === 0 ? (
                <div style={{ padding: '16px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
                  단계 없음
                </div>
              ) : scenario.steps.map((step, i) => {
                // 턴 교대: 봇 답변 사이의 '사용자 응답 대기' 구분선
                if (step.actor === 'wait') {
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 8, padding: '7px 16px',
                      background: 'repeating-linear-gradient(45deg,#FBFCFE,#FBFCFE 6px,#F3F6FB 6px,#F3F6FB 12px)',
                      borderBottom: i < scenario.steps.length - 1 ? '1px solid #F1F5F9' : 'none',
                      fontSize: 11, color: '#94A3B8', fontWeight: 500,
                    }}>
                      ⏳ 사용자 응답을 기다림
                    </div>
                  )
                }
                const isUser = step.actor === 'user'
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: i < scenario.steps.length - 1 ? '1px solid #F1F5F9' : 'none',
                      background: isUser ? '#F8FBFF' : '#fff',
                    }}
                  >
                    {/* 번호 + 화자 배지 */}
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, width: 88 }}>
                      <span style={{
                        flexShrink: 0,
                        width: 20, height: 20, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        color: '#64748B', background: '#F1F5F9',
                      }}>
                        {i + 1}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: isUser ? 'var(--color-primary-500)' : '#475569',
                        background: isUser ? '#DBEAFE' : '#F1F5F9',
                        border: `1px solid ${isUser ? '#BFDBFE' : '#E2E8F0'}`,
                        borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap',
                      }}>
                        {isUser ? '🙋 사용자' : '🤖 봇'}
                      </span>
                    </div>

                    {/* 내용 전문 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {step.actions && step.actions.length > 0 && (
                        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>
                          <span style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '1px 6px' }}>
                            ⚙ 처리: {step.actions.join(' · ')}
                          </span>
                        </div>
                      )}
                      <div style={{ fontSize: 14, color: '#1F2937', lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {step.text}
                      </div>
                      {step.repeat && (
                        <div style={{ fontSize: 12, color: 'var(--color-primary-500)', marginTop: 5, fontWeight: 500 }}>
                          ↻ 올바른 값일 때까지 반복
                        </div>
                      )}
                      {step.choices && step.choices.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                          <span style={{ fontSize: 11, color: '#94A3B8', alignSelf: 'center', marginRight: 2 }}>선택지</span>
                          {step.choices.map((c, ci) => (
                            <span key={ci} style={{
                              fontSize: 12,
                              background: '#fff',
                              border: '1px solid #D1D5DB',
                              borderRadius: 12,
                              padding: '2px 10px',
                              color: '#374151',
                            }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── FlowCanvas ──────────────────────────────────────────────────────────
// props:
//   flowJson   — 레퍼런스 flow_json
//   name       — 레퍼런스 이름 (내보내기 파일명용)
//   readOnly   — 읽기 전용 여부 (기본 true; v0.5 편집 대비)
export default function FlowCanvas({ flowJson, name = '', readOnly = true, onFlowChange, onEdgeSelect, onNodeSelect, scenarioNames }) {
  const [view, setView] = useState('structure')
  const [fullscreen, setFullscreen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const containerRef = useRef(null)
  const structureRef = useRef(null)
  const userFlowContentRef = useRef(null)
  const rfRef = useRef(null)  // react-flow 인스턴스(풀스크린 시 뷰포트 조정용)
  const didMountRef = useRef(false)
  const prevViewRef = useRef(null)  // 전환 직전 뷰포트 중심(flow 좌표)·배율·컨테이너 크기

  const structure = useMemo(() => deriveStructure(flowJson || {}, { scenarioNames }), [flowJson, scenarioNames])
  const { rfNodes: initNodes, rfEdges: initEdges } = useMemo(() => buildLayout(structure, { readOnly }), [structure, readOnly])

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  // flowJson 변경 시 레이아웃 재적용 — 편집 모드에서는 캔버스가 소스 오브 트루스이므로 prop 변경으로 덮어쓰지 않는다
  useEffect(() => { if (readOnly) setNodes(initNodes) }, [initNodes, readOnly])
  useEffect(() => { if (readOnly) setEdges(initEdges) }, [initEdges, readOnly])

  const showMinimap = nodes.filter(n => n.type === 'structureNode').length > 30

  const nodeSeqRef = useRef(0)

  // 노드 변경 핸들러 — 삭제 이벤트 시 canvasToFlow로 재계산
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes)
    if (readOnly) return
    const removals = changes.filter(c => c.type === 'remove')
    if (removals.length === 0) return
    const removedIds = new Set(removals.map(c => c.id))
    const newNodes = nodes.filter(n => !removedIds.has(n.id))
    const newFlow = canvasToFlow(flowJson, { nodes: newNodes, edges })
    onFlowChange?.(newFlow)
  }, [readOnly, onNodesChange, nodes, edges, flowJson, onFlowChange])

  // 엣지 변경 핸들러 — 삭제(연결 끊기) 이벤트 시 canvasToFlow로 재계산해 flowJson 반영
  const handleEdgesChange = useCallback((changes) => {
    onEdgesChange(changes)
    if (readOnly) return
    const removals = changes.filter(c => c.type === 'remove')
    if (removals.length === 0) return
    const removedIds = new Set(removals.map(c => c.id))
    const newEdges = edges.filter(e => !removedIds.has(e.id))
    const newFlow = canvasToFlow(flowJson, { nodes, edges: newEdges })
    onFlowChange?.(newFlow)
  }, [readOnly, onEdgesChange, nodes, edges, flowJson, onFlowChange])

  // 편집 모드 — 선택된 엣지 조건 편집. UI는 부모(DiagramEditPanel)가 캔버스 밖에 렌더(겹침 방지).
  // 최신 nodes/edges/flowJson을 ref로 읽어 apply가 stale 클로저를 잡지 않게 한다.
  const nodesRef = useRef(nodes); nodesRef.current = nodes
  const edgesRef = useRef(edges); edgesRef.current = edges
  const flowJsonRef = useRef(flowJson); flowJsonRef.current = flowJson

  // 엣지 조건 적용 — 타겟 노드 진입 조건으로 저장(canvasToFlow가 반영). 라벨은 conditionLabel 자동.
  const applyEdgeCondition = useCallback((edgeId, condition) => {
    const cond = String(condition || '')
    const hasCond = cond.trim() !== ''
    const label = conditionLabel(cond)
    const newEdges = edgesRef.current.map((e) => {
      if (e.id !== edgeId) return e
      const data = { ...(e.data || {}), condition: cond, label }
      // waitEdge(턴 경계)는 유지, 그 외엔 조건 있으면 branchEdge로 즉시 라벨 표시
      const type = e.type === 'waitEdge' ? 'waitEdge' : (hasCond ? 'branchEdge' : 'smoothstep')
      return { ...e, type, data }
    })
    setEdges(newEdges)
    const newFlow = canvasToFlow(flowJsonRef.current, { nodes: nodesRef.current, edges: newEdges })
    onFlowChange?.(newFlow)
  }, [onFlowChange, setEdges])

  // 현재 flow(원본 prop 기준)에서 머신 노드를 찾는다 — 미편집 노드의 config 조회용.
  const machineNodeById = useCallback((id) => {
    const main = (flowJsonRef.current?.dialogs || []).find((d) => d.id === 'main')
    return (main?.nodes || []).find((n) => n.id === id) || null
  }, [])

  // 선택 노드의 편집 대상 머신 노드({id,type,label,config})를 재구성한다.
  //   structureNode: data에 type/label 있음. config는 편집됐으면 data.config, 아니면 원본에서.
  //   loopGroup(반복): data에 type/config 없음 → type='subflow', config는 원본(body 등 보존).
  const resolveNode = useCallback((id) => {
    const cn = nodesRef.current.find((n) => n.id === id)
    if (!cn) return null
    const orig = machineNodeById(id)
    const type = cn.data?.type || (cn.type === 'loopGroup' ? 'subflow' : orig?.type)
    const label = cn.data?.label ?? orig?.label ?? ''
    const config = cn.data?.config !== undefined ? cn.data.config : (orig?.config || {})
    const node = { id, type, label, config }
    // 반복은 본문(body) 리스트를 함께 전달 — 편집 중이면 캔버스 data.body, 아니면 현재 flow에서 읽음.
    if (type === 'subflow') {
      node.body = cn.data?.body !== undefined ? cn.data.body : readLoopBody(flowJsonRef.current, id)
    }
    return node
  }, [machineNodeById])

  // 노드 내용 적용 — 편집기 필드 → 새 config, 캔버스 노드 data(label/config) 갱신 후 canvasToFlow.
  //   내용은 캔버스 data에 저장돼야 이후 구조 변경(재계산)에도 보존된다(canvasToFlow step 7).
  const applyNodeEdit = useCallback((id, fields) => {
    const node = resolveNode(id)
    if (!node) return
    const { label, type: _t, bodySteps, ...rest } = fields
    const newConfig = writeNodeConfig(node.type, node.config, rest)
    const newLabel = String(label ?? '')
    const newNodes = nodesRef.current.map((n) => {
      if (n.id !== id) return n
      const data = { ...n.data, label: newLabel, config: newConfig }
      if (node.type === 'subflow') {
        data.maxCount = rest.count || null
        if (bodySteps !== undefined) { data.body = bodySteps; data.bodyCount = bodySteps.length }
      }
      return { ...n, data }
    })
    setNodes(newNodes)
    const newFlow = canvasToFlow(flowJsonRef.current, { nodes: newNodes, edges: edgesRef.current })
    onFlowChange?.(newFlow)
  }, [resolveNode, onFlowChange, setNodes])

  // 노드 편집 컨텍스트 — 부모(DiagramEditPanel)가 NodeEditor로 렌더.
  const openNodeEditor = useCallback((id) => {
    const node = resolveNode(id)
    if (!node) { onNodeSelect?.(null); return }
    onEdgeSelect?.(null)  // 엣지 편집기와 동시에 뜨지 않게
    onNodeSelect?.({ id, node, flowJson: flowJsonRef.current, apply: (fields) => applyNodeEdit(id, fields) })
  }, [resolveNode, onEdgeSelect, onNodeSelect, applyNodeEdit])

  // 콘텐츠 노드 클릭 → 노드 편집기(반복 박스는 헤더 ⚙ 버튼이 openNodeEditor 호출).
  const handleNodeClick = useCallback((_e, node) => {
    if (readOnly || node?.type !== 'structureNode') return
    openNodeEditor(node.id)
  }, [readOnly, openNodeEditor])

  // 편집 컨텍스트(반복 박스 ⚙ 등 커스텀 노드용) — 값 안정화.
  const editCtxValue = useMemo(() => ({ editable: !readOnly, onEdit: openNodeEditor }), [readOnly, openNodeEditor])

  // 선택 변경 → 엣지 1개 선택 시 조건 편집 컨텍스트, 아니면 null(노드 편집은 클릭/⚙로 진입).
  const handleSelectionChange = useCallback(({ edges: selEdges }) => {
    if (readOnly) { onEdgeSelect?.(null); return }
    const one = Array.isArray(selEdges) && selEdges.length === 1 ? selEdges[0] : null
    if (!one) { onEdgeSelect?.(null); return }
    const labelOf = (id) => nodesRef.current.find((n) => n.id === id)?.data?.label || id
    onNodeSelect?.(null)  // 엣지 선택 시 노드 편집 닫기
    onEdgeSelect?.({
      id: one.id,
      sourceLabel: labelOf(one.source),
      targetLabel: labelOf(one.target),
      condition: one.data?.condition || '',
      flowJson: flowJsonRef.current,
      apply: (expr) => applyEdgeCondition(one.id, expr),
    })
  }, [readOnly, onEdgeSelect, onNodeSelect, applyEdgeCondition])

  // 엣지 연결 핸들러
  const handleConnect = useCallback((params) => {
    if (readOnly) return
    const newEdge = { ...params, deletable: !readOnly, focusable: !readOnly, type: 'smoothstep', style: { stroke: '#9CA3AF', strokeWidth: 1.5 } }
    const newEdges = addEdge(newEdge, edges)
    setEdges(newEdges)
    const newFlow = canvasToFlow(flowJson, { nodes, edges: newEdges })
    onFlowChange?.(newFlow)
  }, [readOnly, edges, nodes, flowJson, onFlowChange, setEdges])

  // 팔레트 노드 추가 핸들러
  const handleAddNode = useCallback((type) => {
    if (readOnly) return
    nodeSeqRef.current += 1
    const id = `n_${type}_${nodeSeqRef.current}`
    const vp = rfRef.current?.getViewport() || { x: 0, y: 0, zoom: 1 }
    const rect = structureRef.current?.getBoundingClientRect()
    const cx = rect ? (rect.width / 2 - vp.x) / vp.zoom : 200
    const cy = rect ? (rect.height / 2 - vp.y) / vp.zoom : 200
    const newNode = { id, type: 'structureNode', position: { x: cx - NODE_W / 2, y: cy - NODE_H / 2 }, data: { type, label: '', id }, deletable: true }
    const newNodes = [...nodes, newNode]
    setNodes(newNodes)
    const newFlow = canvasToFlow(flowJson, { nodes: newNodes, edges })
    onFlowChange?.(newFlow)
  }, [readOnly, nodes, edges, flowJson, onFlowChange, setNodes])

  // ─── 풀스크린 ─────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    // 전환 직전 현재 뷰포트의 중심(flow 좌표)·배율·컨테이너 크기 저장 → 전환 후 같은 중심·비율 유지
    const inst = rfRef.current
    const rect = containerRef.current?.getBoundingClientRect()
    if (inst && rect && view === 'structure' && rect.width > 0 && rect.height > 0) {
      const vp = inst.getViewport()
      prevViewRef.current = {
        cx: (rect.width / 2 - vp.x) / vp.zoom,
        cy: (rect.height / 2 - vp.y) / vp.zoom,
        zoom: vp.zoom,
        w: rect.width,
        h: rect.height,
      }
    } else {
      prevViewRef.current = null
    }
    if (!fullscreen) {
      setFullscreen(true)
      containerRef.current?.requestFullscreen?.().catch(() => {})
    } else {
      setFullscreen(false)
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [fullscreen, view])

  // 풀스크린 전환 시 뷰포트 중심·배율 보존: 저장해둔 중심을 그대로 두고, 컨테이너 크기 증가 비율만큼 배율을 키운다.
  // (초기 마운트는 건너뜀 — ReactFlow의 fitView prop이 초기 뷰를 담당. 뷰 토글은 ReactFlow 리마운트로 자동 처리.)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (view !== 'structure') return
    const inst = rfRef.current
    if (!inst) return
    const prev = prevViewRef.current
    const t = setTimeout(() => {
      const rect = containerRef.current?.getBoundingClientRect()
      try {
        if (prev && rect && prev.w > 0 && prev.h > 0) {
          // 같은 중심 유지 + 화면이 커진 비율만큼(작은 축 기준) 확대 → 보던 영역이 잘리지 않고 같은 비율로 커짐
          const scale = Math.min(rect.width / prev.w, rect.height / prev.h)
          const newZoom = Math.max(0.15, Math.min(2.5, prev.zoom * scale))
          inst.setViewport(
            { x: rect.width / 2 - prev.cx * newZoom, y: rect.height / 2 - prev.cy * newZoom, zoom: newZoom },
            { duration: 200 },
          )
        } else {
          inst.fitView({ padding: 0.12, maxZoom: fullscreen ? 2.5 : 1, duration: 200 })
        }
      } catch { /* noop */ }
    }, 120)  // 컨테이너 리사이즈(풀스크린 전환) 후 적용
    return () => clearTimeout(t)
  }, [fullscreen])

  // 네이티브 fullscreen ESC → React state 동기화
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // CSS 오버레이 fullscreen 상태에서 ESC 키 처리 (네이티브 API 미지원 환경 대비)
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // ─── PNG 내보내기 ──────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const targetRef = view === 'structure' ? structureRef : userFlowContentRef
    if (!targetRef.current || exporting) return
    setExporting(true)
    try {
      const safeFileName = (name || 'flow').replace(/[\\/:*?"<>|\s]/g, '-')
      const dataUrl = await toPng(targetRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `dialogflow-flow-${safeFileName}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      console.warn('[FlowCanvas] PNG 내보내기 실패:', e)
    } finally {
      setExporting(false)
    }
  }, [view, name, exporting])

  // ─── 공통 캔버스 콘텐츠 ───────────────────────────────────────────────
  const canvasContent = (
    <>
      {/* 상단 툴바 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid #E5E7EB',
          background: '#fff',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <ViewToggle view={view} onChange={setView} />
        {name && (
          <span
            style={{
              fontSize: 13,
              color: '#6B7280',
              marginLeft: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {name}
          </span>
        )}
        {!name && <div style={{ flex: 1 }} />}

        {/* PNG 내보내기 버튼 */}
        <button
          onClick={handleExport}
          disabled={exporting}
          title="PNG 내보내기"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 500,
            color: exporting ? '#9CA3AF' : '#374151',
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 6,
            cursor: exporting ? 'default' : 'pointer',
          }}
        >
          <Download size={14} />
          {exporting ? '생성 중…' : 'PNG'}
        </button>

        {/* 풀스크린 토글 버튼 */}
        <button
          onClick={toggleFullscreen}
          title={fullscreen ? '닫기' : '전체 화면'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 5,
            color: '#374151',
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {fullscreen ? <X size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      {/* 캔버스 영역 */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {view === 'structure' ? (
          <div ref={structureRef} style={{ width: '100%', height: '100%' }}>
            <NodeEditContext.Provider value={editCtxValue}>
            <ReactFlow
              onInit={(inst) => { rfRef.current = inst }}
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onNodeClick={handleNodeClick}
              onSelectionChange={handleSelectionChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={true}
              nodesConnectable={!readOnly}
              edgesUpdatable={false}
              elementsSelectable={true}
              deleteKeyCode={readOnly ? null : 'Delete'}
              fitView
              fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
              minZoom={0.15}
              maxZoom={2.5}
              proOptions={{ hideAttribution: false }}
            >
              <Background variant={BackgroundVariant.Dots} color="#CBD5E1" gap={20} size={1.5} />
              <Panel position="top-left"><Legend /></Panel>
              {!readOnly && (
                <Panel position="top-right">
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, marginBottom: 2 }}>노드 추가</div>
                    {LEGEND_ITEMS.filter(({ type }) => isEditableType(type)).map(({ type, ko }) => {
                      const c = TYPE_COLORS[type] || DEFAULT_COLOR
                      return (
                        <button
                          key={type}
                          onClick={() => handleAddNode(type)}
                          title={`${ko} 노드 추가`}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', fontSize: 11, fontWeight: 500, color: c.badgeText, background: c.badgeBg, border: `1px solid ${c.border}`, borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          + {ko}
                        </button>
                      )
                    })}
                  </div>
                </Panel>
              )}
              <Controls showInteractive={false} />
              {showMinimap && (
                <MiniMap
                  nodeColor={n => {
                    if (n.type === 'scenarioGroup') return '#E5E7EB'
                    const c = TYPE_COLORS[n.data?.type]
                    return c ? c.border : '#9CA3AF'
                  }}
                  maskColor="rgba(241,245,249,0.7)"
                />
              )}
            </ReactFlow>
            </NodeEditContext.Provider>
          </div>
        ) : (
          <UserFlowView flowJson={flowJson} contentRef={userFlowContentRef} scenarioNames={scenarioNames} />
        )}
      </div>
    </>
  )

  // ─── 풀스크린 오버레이 vs 일반 래퍼 ──────────────────────────────────
  if (fullscreen) {
    return (
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          background: '#F8FAFC',
        }}
      >
        {canvasContent}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#F8FAFC',
      }}
    >
      {canvasContent}
    </div>
  )
}
