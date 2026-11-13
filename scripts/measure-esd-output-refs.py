#!/usr/bin/env python3
"""ESD 조회 결과가 하류 output 멘트에서 어떻게 쓰이는지 분류한다(2026-10-14 실측용).

사용: dialogflow_results(또는 dev_) 행 배열 JSON(select=id,created_at,generated_json,generation_tiers)을 인자로.
  python3 -I scripts/measure-esd-output-refs.py results.json
유형: unused(미사용) / key_not_in_schema(스키마에 없는 키) / whole(통째) / count_only(.length만) /
      echo_where_only(조회 키만 되읊음) / ok
"""
import json, re, sys
from collections import Counter

REF = re.compile(r'\$\{([^}]+)\}')
strip = lambda s: re.sub(r'^(local|context|user)\.', '', s)


def texts(n):
    return [x for it in (n.get('config') or {}).get('items') or [] if it.get('type') == 'text'
            for t in it.get('text') or [] for x in (t.get('texts') or []) if isinstance(x, str)]


def main(path):
    rs = json.load(open(path))
    cnt, rows = Counter(), []
    for r in rs:
        g = r.get('generated_json') or {}
        tiers = r.get('generation_tiers') or {}
        schemas = {s.get('name'): {f.get('name') for f in s.get('fields', [])}
                   for s in (tiers.get('esd_schemas') or []) if isinstance(s, dict)}
        for d in g.get('dialogs') or []:
            nodes = d.get('nodes') or []
            by = {n.get('id'): n for n in nodes}
            for n in nodes:
                c = n.get('config') or {}
                if n.get('type') != 'esd' or c.get('type') not in ('findone', 'findall'):
                    continue
                vs = [strip(x.get('key')) for x in c.get('result') or []
                      if isinstance(x.get('value'), str) and '_result' in x['value']]
                if not vs:
                    continue
                V = vs[0]
                schema_name = (c.get('query') or {}).get('schemaName') or c.get('schemaName')
                fields = schemas.get(schema_name, set())
                where = {w.get('field') for w in ((c.get('query') or {}).get('where') or []) if isinstance(w, dict)}
                seen, q, outs = set(), list(n.get('then') or []), []
                while q:
                    i = q.pop(0)
                    if i in seen or i not in by:
                        continue
                    seen.add(i)
                    m = by[i]
                    if m.get('type') == 'output':
                        outs += texts(m)
                    q += m.get('then') or []
                refs = [strip(x.strip()) for t in outs for x in REF.findall(t)]
                refs = [x for x in refs if x == V or x.startswith(V + '.') or x.startswith(V + '[')]
                keys = [re.sub(r'^\[\d+\]', '', x[len(V):]).lstrip('.') for x in refs]
                keys = [k for k in keys if k != 'length']
                if not refs:
                    kind = 'unused'
                elif any(x == V for x in refs):
                    kind = 'whole'
                elif not keys:
                    kind = 'count_only'
                elif any(k not in fields for k in keys):
                    kind = 'key_not_in_schema'
                elif all(k in where for k in keys):
                    kind = 'echo_where_only'
                else:
                    kind = 'ok'
                cnt[kind] += 1
                rows.append((r['id'][:8], r.get('created_at', '')[:10], c['type'], kind,
                             len(fields - where), V, keys[:4]))
    total = sum(cnt.values())
    print(f'조회 노드 {total}개')
    for k, v in cnt.most_common():
        print(f'  {k}: {v} ({v * 100 // max(total, 1)}%)')
    print(f'  스키마에 조회 키 외 필드가 0개: {sum(1 for x in rows if x[4] == 0)}/{total}')
    for x in rows:
        print('  ', x)


if __name__ == '__main__':
    main(sys.argv[1])
