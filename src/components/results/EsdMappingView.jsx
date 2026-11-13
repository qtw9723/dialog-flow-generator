// D7 실계약: mappings[{esdField,candidates[],auto}] / unmappedEsdFields / unmappedVars
export default function EsdMappingView({ mapping }) {
  const mappings = mapping?.mappings ?? []
  const unmappedEsdFields = mapping?.unmappedEsdFields ?? []
  const unmappedVars = mapping?.unmappedVars ?? []

  const fmtScore = (s) => (typeof s === 'number' ? `${Math.round(s * 100)}%` : '—')

  return (
    <div>
      {/* 매핑표 */}
      {mappings.length > 0 ? (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left text-xs text-gray-500 uppercase">
                <th className="px-3 py-2 border border-gray-200 font-medium">ESD 필드</th>
                <th className="px-3 py-2 border border-gray-200 font-medium">타입</th>
                <th className="px-3 py-2 border border-gray-200 font-medium">상위 후보</th>
                <th className="px-3 py-2 border border-gray-200 font-medium">점수</th>
                <th className="px-3 py-2 border border-gray-200 font-medium">확정</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m, i) => {
                const { esdField, candidates, auto } = m
                const top = candidates?.[0]
                const rest = candidates?.slice(1) ?? []
                return (
                  <tr key={i} className="border-b border-gray-100 hover:bg-white">
                    <td className="px-3 py-2 border border-gray-200 font-mono text-xs text-gray-800">
                      <span className="text-gray-500">{esdField?.entityName}.</span>{esdField?.name}
                      {esdField?.key ? ' 🔑' : ''}
                      {esdField?.crypt === 'true' ? ' 🔒' : ''}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 text-xs text-gray-600">{esdField?.type ?? '—'}</td>
                    <td className="px-3 py-2 border border-gray-200">
                      {top ? (
                        <span>
                          <span className="font-mono text-xs text-gray-800">{top.varName}</span>
                          <span className="text-xs text-gray-500 ml-1">:{top.varType}</span>
                          {rest.length > 0 && (
                            <span className="ml-1 text-xs text-gray-400" title={rest.map((c) => c.varName).join(', ')}>
                              +{rest.length}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-red-400">후보 없음</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 text-xs text-gray-600">
                      {top ? fmtScore(top.score) : '—'}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 text-center">
                      {auto ? (
                        <span className="inline-block px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">자동확정</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-4">매핑 항목이 없습니다.</p>
      )}

      {/* 미매핑 경고 */}
      {(unmappedEsdFields.length > 0 || unmappedVars.length > 0) && (
        <div className="space-y-3">
          {unmappedEsdFields.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <p className="text-xs font-semibold text-yellow-700 mb-1">⚠ 매핑 실패 ESD 필드 ({unmappedEsdFields.length}개)</p>
              <div className="flex flex-wrap gap-1">
                {unmappedEsdFields.map((f, i) => (
                  <span key={i} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded font-mono">
                    {f.entityName}.{f.name}:{f.type}
                  </span>
                ))}
              </div>
            </div>
          )}
          {unmappedVars.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded p-3">
              <p className="text-xs font-semibold text-orange-700 mb-1">⚠ 미사용 수집변수 ({unmappedVars.length}개)</p>
              <div className="flex flex-wrap gap-1">
                {unmappedVars.map((v, i) => (
                  <span key={i} className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-mono">
                    {v.name}:{v.type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
