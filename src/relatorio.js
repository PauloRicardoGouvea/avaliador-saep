export function gerarRelatorio(vereditos) {
  const linhas = ["═".repeat(60), "  RELATÓRIO DE AVALIAÇÃO — SAEP", "═".repeat(60)];

  for (const [atividade, dados] of Object.entries(vereditos)) {
    const icone =
      dados.veredito === "MAXIMA"
        ? "✅"
        : dados.veredito === "ESTOURO_TEMPO"
          ? "🕐"
          : "⚠️ ";
    linhas.push(``, `${icone} ${atividade} → ${dados.veredito}${dados.pendente ? " (PENDENTE DE REVISÃO)" : ""}`);
    for (const ev of dados.evidencias) linhas.push(`   • ${ev}`);
  }

  linhas.push("", "═".repeat(60));
  return linhas.join("\n");
}