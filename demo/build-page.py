#!/usr/bin/env python3
"""demo/recorded/run.json(= deno run demo/run-demo.ts 결과)을 정적 인포그래픽 web/replay.html로 만든다."""
import html, json, pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
r = json.loads((root / "demo/recorded/run.json").read_text(encoding="utf-8"))
e = html.escape

v1, rep, v2 = r["validate1"]["errors"], r["repair"], r["validate2"]
after = rep["after"]["errors"]
x = r["expand"]
assert len(v1) == 3 and len(after) == 1 and v2["valid"] and x["uniqueIds"] and not x["dangling"], "기록이 시나리오와 다릅니다"
n_design = len(r["design2"])

def node(kind, label, sub="", bad=False):
    tag = {"llm": "LLM", "code": "코드", "ppl": "입력"}[kind]
    cls = {"llm": "st llm", "code": "st", "ppl": "st ppl"}[kind] + (" bad" if bad else "")
    return f'<li><span class="{cls}"><small>{tag}</small>{label}{("<br>" + sub) if sub else ""}</span></li>'
def lane(items): return '<ol class="lane">' + "".join(node(*i) for i in items) + "</ol>"
def errs(lst, ok_text):
    if not lst: return f'<li class="ok"><span class="res">OK</span><span>{e(ok_text)}</span></li>'
    return "".join(f'<li class="fail"><span class="res">오류</span><span>{e(m)}</span></li>' for m in lst)

legend = '<ul class="legend" aria-label="범례"><li><span class="sw llm"></span>LLM (데모에선 스크립트)</li><li><span class="sw"></span>코드 (실제 실행)</li><li><span class="sw ppl"></span>입력</li><li><span class="sw bad"></span>문제 지점</li></ul>'
pipeline = lane([("ppl","요구 문서"),("llm","흐름 설계"),("code","노드 확장","LLM 0회"),("llm","값 채우기"),("llm","스키마 도출"),("code","안전장치","규칙 엔진")])
run = lane([("llm","1차 설계","노드 6개"),("code","검증",f"오류 {len(v1)}개",True),("code","자동 보정","2개 수정"),("code","재검증","1개 남음",True),("llm","2차 설계","오류를 피드백"),("code","검증","통과")])
cards = f'''<div class="vs three">
<div class="card bad"><h3>① 1차 설계 직후</h3><ul>{errs(v1,"")}</ul><div class="exit"><code>오류 {len(v1)}</code><span class="why">미지 종류·끊긴 참조·무한 반복 가능 루프</span></div></div>
<div class="card bad"><h3>② 자동 보정 후</h3><ul>{errs(after,"")}</ul><div class="exit"><code>오류 {len(after)}</code><span class="why">코드가 못 고치는 건 LLM에 되돌립니다</span></div></div>
<div class="card good"><h3>③ 재설계 후</h3><ul>{errs([], "모든 검사 통과")}</ul><div class="exit"><code>오류 0</code><span class="why">여기서야 확장 단계로 넘어갑니다</span></div></div>
</div>'''
loop = json.dumps(x["loopNode"], ensure_ascii=False, indent=1)
expand = f'''<div class="facts"><div><b>{n_design}</b>LLM이 설계한 노드</div><div><b>{x["nodes"]}</b>확장 후 노드 (코드가 인사·초기화·폴백 등을 추가)</div><div><b>0</b>확장에 쓴 LLM 호출</div><div><b>{x["dialogs"]}</b>생성된 대화 묶음</div></div>
<pre class="diff"><span class="c">반복 노드 — "loop"(의도)가 실제 노드로 결정론 변환된 결과</span>
{e(loop)}</pre>'''
checks = ["미지의 노드 종류를 제거","끊긴 next 참조를 제거","탈출 변수가 없는 반복을 적발","보정 불가 오류는 LLM에 되돌림","재설계 후 검증 통과","인사 노드를 코드가 보장","확장 결과 id 중복·끊긴 참조 0"]
checks_html = "".join(f'<li><span class="res">PASS</span>{e(c)}</li>' for c in checks)
raw = e(json.dumps(r, ensure_ascii=False, indent=1))

css = pathlib.Path("/home/claude/olympus-public/web/replay.html").read_text(encoding="utf-8")
css = re.search(r"<style>(.*?)</style>", css, re.S).group(1)
css += ".diff{max-height:none}.exit code{white-space:nowrap}.vs.three{grid-template-columns:repeat(3,minmax(0,1fr))}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:0 0 16px}.facts div{border:1.5px solid var(--rule);padding:12px 14px;font-size:14px;color:var(--muted)}.facts b{display:block;font-size:30px;line-height:1.2;color:var(--ink)}@media (max-width:820px){.vs.three{grid-template-columns:1fr}}"

page = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DialogFlow Generator 데모 — LLM이 설계하고, 코드가 검증한다</title>
<meta name="description" content="LLM 다단계 생성 파이프라인에서 결정론 코드가 설계 결함을 적발·보정·확장하는 과정을 실제 소스 실행 기록으로 보여줍니다. 실운영이 아닌 스크립트 데모입니다.">
<style>{css}</style>
</head>
<body>
<header><div class="wrap">
<span class="tag">실운영 아님 · 스크립트된 LLM 응답</span>
<h1>LLM이 설계하고, 코드가 검증합니다</h1>
<p>요구 문서 → 대화 흐름 JSON 생성기의 검증·보정·확장 구간을, 실제 소스를 그대로 실행한 기록입니다. LLM 호출 2번만 스크립트로 대신했습니다.</p>
</div></header>
<main>
<section><div class="wrap">
<h2>생성 파이프라인</h2>
<p class="cap">LLM이 하는 일과 코드가 하는 일을 나눠, LLM이 흔들려도 결과가 깨지지 않게 합니다.</p>
{legend}{pipeline}
</div></section>
<section><div class="wrap">
<h2>이번 실행에서 일어난 일</h2>
<p class="cap">요구: {e(r["requirement"])}</p>
<div class="row">{run}</div>
</div></section>
<section><div class="wrap">
<h2>검증 결과가 바뀌는 과정</h2>
<p class="cap">같은 검증 함수가 세 번 돌았습니다. 코드로 고칠 수 있는 오류는 고치고, 의미가 필요한 오류만 LLM에게 되돌립니다.</p>
{cards}
</div></section>
<section><div class="wrap">
<h2>확장은 LLM 없이</h2>
<p class="cap">검증을 통과한 설계는 노드 스펙 골격에 값을 채우는 방식으로 결정론적으로 펼쳐집니다.</p>
{expand}
</div></section>
<section><div class="wrap">
<h2>검증된 항목</h2>
<p class="cap">데모 스크립트가 실행 끝에 확인하는 항목입니다.</p>
<ul class="checks">{checks_html}</ul>
</div></section>
<section><div class="wrap">
<h2>원본 기록</h2>
<details><summary>run.json 전체</summary><pre>{raw}</pre></details>
</div></section>
</main>
<footer><div class="wrap">직접 실행: <code>deno run --allow-write --allow-read demo/run-demo.ts</code> 후 <code>python3 demo/build-page.py</code></div></footer>
</body>
</html>
"""
out = root / "web/replay.html"
out.write_text(page, encoding="utf-8")
print("wrote", out, len(page), "bytes")
