import fs from "node:fs";
import path from "node:path";

/** Gera dashboard HTML único com todos os alunos e filtro por turma */
export function gerarDashboard(resultados, saida) {
  const turmas = [...new Set(resultados.map((r) => r.aluno.turma))].sort();

  const cards = resultados
    .sort((a, b) => b.parecer.totais.percentual - a.parecer.totais.percentual)
    .map(cardAluno)
    .join("\n");

  const mediaPorTurma = turmas
    .map((t) => {
      const alunos = resultados.filter((r) => r.aluno.turma === t);
      const media = Math.round(
        alunos.reduce((s, r) => s + r.parecer.totais.percentual, 0) / alunos.length
      );
      return `<div class="stat"><span class="stat-num">${media}%</span><span>média ${t} (${alunos.length} alunos)</span></div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Dashboard SAEP</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
  h1 { margin-bottom: 4px; } .sub { color: #94a3b8; margin-bottom: 24px; }
  .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { background: #1e293b; padding: 16px 24px; border-radius: 12px; display: flex; flex-direction: column; }
  .stat-num { font-size: 28px; font-weight: 700; color: #38bdf8; }
  .filtros button { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 8px 20px; border-radius: 8px; cursor: pointer; margin-right: 8px; }
  .filtros button.ativo { background: #38bdf8; color: #0f172a; font-weight: 700; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; margin-top: 20px; }
  .card { background: #1e293b; border-radius: 12px; padding: 20px; border-left: 4px solid var(--cor); }
  .card h3 { display: flex; justify-content: space-between; }
  .badge { font-size: 12px; background: #334155; padding: 2px 10px; border-radius: 99px; }
  .barra { height: 8px; background: #334155; border-radius: 99px; margin: 12px 0; overflow: hidden; }
  .barra div { height: 100%; background: var(--cor); width: var(--pct); }
  .pilares { display: flex; gap: 8px; margin: 10px 0; font-size: 13px; }
  .pilar { padding: 4px 10px; border-radius: 6px; background: #334155; }
  .pilar.ok { background: #14532d; } .pilar.no { background: #7f1d1d; } .pilar.rev { background: #78350f; }
  .parecer { font-size: 13px; color: #cbd5e1; line-height: 1.6; margin-top: 8px; }
  details summary { cursor: pointer; color: #38bdf8; font-size: 13px; margin-top: 8px; }
  .evid { font-size: 12px; color: #94a3b8; padding-left: 16px; }
</style>
</head>
<body>
<h1>📊 Dashboard de Avaliação — SAEP</h1>
<p class="sub">Gerado em ${new Date().toLocaleString("pt-BR")} · ${resultados.length} alunos</p>
<div class="stats">${mediaPorTurma}</div>
<div class="filtros">
  <button class="ativo" onclick="filtrar('todas', this)">Todas</button>
  ${turmas.map((t) => `<button onclick="filtrar('${t}', this)">${t}</button>`).join("")}
</div>
<div class="grid">${cards}</div>
<script>
function filtrar(turma, btn) {
  document.querySelectorAll(".filtros button").forEach(b => b.classList.remove("ativo"));
  btn.classList.add("ativo");
  document.querySelectorAll(".card").forEach(c => {
    c.style.display = (turma === "todas" || c.dataset.turma === turma) ? "" : "none";
  });
}
</script>
</body>
</html>`;

  fs.writeFileSync(path.join(saida, "dashboard.html"), html, "utf-8");
}

function cardAluno({ aluno, parecer, vereditos, der, sql, rotas }) {
  const pct = parecer.totais.percentual;
  const cor = pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";

  const pilar = (nome, ok, rev = false) =>
    `<span class="pilar ${rev ? "rev" : ok ? "ok" : "no"}">${nome} ${rev ? "⚠️" : ok ? "✓" : "✗"}</span>`;

  const evidencias = Object.entries(vereditos)
    .map(([id, v]) => `<div class="evid">• <b>${id}</b>: ${v.evidencias.join(" ")}</div>`)
    .join("");

  return `<div class="card" data-turma="${esc(aluno.turma)}" style="--cor:${cor};--pct:${pct}%">
    <h3>${esc(aluno.nome)} <span class="badge">${esc(aluno.turma)}</span></h3>
    <div class="barra"><div></div></div>
    <b style="color:${cor}">${pct}% das funcionalidades no teto máximo</b>
    <div class="pilares">
      ${pilar("SQL", sql.temCreateTable)}
      ${pilar("Backend", rotas.length > 0)}
      ${pilar("DER", der.existe, der.veredito === "AMBIGUO")}
    </div>
    <p class="parecer">${esc(parecer.texto)}</p>
    <details><summary>Evidências técnicas</summary>${evidencias}
      <div class="evid">• <b>DER</b>: ${der.evidencias.map(esc).join(" ")}</div>
    </details>
  </div>`;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);