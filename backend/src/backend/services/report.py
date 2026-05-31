import html
from functools import lru_cache

from backend.schemas.analyze import AnalyzeRequest, AnalyzeResponse, SourceAnnotation


_CSS = """
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f1117; color: #e2e8f0; margin: 0; padding: 0; }
.container { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }
h1 { font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.25rem; }
.subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 2rem; }
h2 { font-size: 1.1rem; font-weight: 600; color: #cbd5e1; border-bottom: 1px solid #1e293b; padding-bottom: 0.5rem; margin: 2rem 0 1rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
th { text-align: left; padding: 0.5rem 0.75rem; color: #64748b; font-weight: 500; border-bottom: 1px solid #1e293b; }
td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1a2234; color: #cbd5e1; }
tr:hover td { background: #1e293b; }
.source-table { font-family: 'JetBrains Mono', 'Cascadia Code', monospace; font-size: 0.8rem; width: 100%; border-collapse: collapse; }
.source-table td { padding: 2px 8px; vertical-align: middle; white-space: pre; }
.lineno { color: #4b5563; width: 3em; text-align: right; user-select: none; padding-right: 1em; }
.code { color: #e2e8f0; }
.energy-cell { text-align: right; color: #64748b; min-width: 90px; }
.bar-cell { width: 140px; }
.bar-bg { background: #1e293b; border-radius: 3px; height: 10px; overflow: hidden; }
.bar-fill { height: 10px; border-radius: 3px; }
.heat-cold     { background: #2d3748; }
.heat-warm     { background: #c05621; }
.heat-hot      { background: #e05252; }
.heat-critical { background: #fc3b3b; }
.source-row-cold     { background: transparent; }
.source-row-warm     { background: rgba(192,86,33,0.08); }
.source-row-hot      { background: rgba(224,82,82,0.14); }
.source-row-critical { background: rgba(252,59,59,0.22); }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.summary-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 1rem 1.25rem; }
.summary-card .label { color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
.summary-card .value { color: #f1f5f9; font-size: 1.4rem; font-weight: 700; margin-top: 0.25rem; }
.footer { color: #4b5563; font-size: 0.75rem; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #1e293b; }
"""


def _heat_class(ratio: float) -> str:
    if ratio < 0.25:
        return "cold"
    if ratio < 0.5:
        return "warm"
    if ratio < 0.75:
        return "hot"
    return "critical"


def _bar_html(ratio: float, heat: str) -> str:
    pct = int(ratio * 100)
    return (
        f'<div class="bar-bg"><div class="bar-fill heat-{heat}" style="width:{pct}%"></div></div>'
    )


def generate_html(request: AnalyzeRequest, response: AnalyzeResponse) -> str:
    # Build a lookup from line number to SourceAnnotation
    annotation_by_line: dict[int, SourceAnnotation] = {}
    for ann in response.sourceAnnotations:
        key = ann.line
        if key not in annotation_by_line or ann.weightedEnergy > annotation_by_line[key].weightedEnergy:
            annotation_by_line[key] = ann

    max_line_energy = max(
        (ann.weightedEnergy for ann in response.sourceAnnotations), default=1.0
    )
    if max_line_energy == 0.0:
        max_line_energy = 1.0

    source_lines = request.code.splitlines()
    flags_str = html.escape(" ".join(request.compilerFlags or ["-O2"]))

    # Summary cards
    s = response.summary
    fn_label = html.escape(s.hottestFunction or "—")
    cards_html = f"""
<div class="summary-grid">
  <div class="summary-card"><div class="label">Total Weighted Energy</div><div class="value">{s.totalWeightedEnergy:.2f}</div></div>
  <div class="summary-card"><div class="label">Total Raw Energy</div><div class="value">{s.totalRawEnergy:.2f}</div></div>
  <div class="summary-card"><div class="label">Hottest Function</div><div class="value" style="font-size:1rem;">{fn_label}</div></div>
  <div class="summary-card"><div class="label">Hottest Line</div><div class="value">{s.hottestLine or "—"}</div></div>
</div>
"""

    # Function table
    func_rows = ""
    for f in response.functions:
        func_rows += (
            f"<tr><td>{html.escape(f.name)}</td>"
            f"<td>{f.weightedEnergy:.3f}</td>"
            f"<td>{f.rawEnergy:.3f}</td>"
            f"<td>{f.instructionCount}</td>"
            f"<td>{f.blockCount}</td>"
            f"<td>{f.fallbackInstructionCount}</td></tr>\n"
        )

    # Annotated source
    source_rows = ""
    for lineno, code in enumerate(source_lines, start=1):
        ann = annotation_by_line.get(lineno)
        energy_val = ann.weightedEnergy if ann else 0.0
        ratio = energy_val / max_line_energy
        heat = _heat_class(ratio) if energy_val > 0 else "cold"
        bar = _bar_html(ratio, heat) if energy_val > 0 else ""
        energy_str = f"{energy_val:.2f}" if energy_val > 0 else ""
        source_rows += (
            f'<tr class="source-row-{heat}">'
            f'<td class="lineno">{lineno}</td>'
            f'<td class="code">{html.escape(code)}</td>'
            f'<td class="bar-cell">{bar}</td>'
            f'<td class="energy-cell">{energy_str}</td>'
            f"</tr>\n"
        )

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Energy Report — {html.escape(request.filename)}</title>
<style>{_CSS}</style>
</head>
<body>
<div class="container">
  <h1>Energy Analysis Report</h1>
  <p class="subtitle">{html.escape(request.filename)} &bull; std={html.escape(request.std)} &bull; flags: {flags_str}</p>
  {cards_html}
  <h2>Functions by Weighted Energy</h2>
  <table>
    <thead><tr>
      <th>Function</th><th>Weighted Energy</th><th>Raw Energy</th>
      <th>Instructions</th><th>Blocks</th><th>Fallback Ops</th>
    </tr></thead>
    <tbody>{func_rows}</tbody>
  </table>
  <h2>Annotated Source</h2>
  <table class="source-table">
    <tbody>{source_rows}</tbody>
  </table>
  <div class="footer">
    Run ID: {html.escape(response.runId)} &bull; Energy values are relative (not physical Joules).
    Heat scale: cold (&lt;25%) &rarr; warm (&lt;50%) &rarr; hot (&lt;75%) &rarr; critical (&ge;75%) of peak line energy.
  </div>
</div>
</body>
</html>"""
    return page


@lru_cache(maxsize=1)
def get_report_service() -> object:
    return None  # stateless — the module-level function is used directly
