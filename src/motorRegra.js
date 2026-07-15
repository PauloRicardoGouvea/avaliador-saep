import { CONFIG } from "./config.js";
import { AVALIADORES } from "./atividades.js";

/**
 * Motor de regras — versão por NÍVEIS.
 *
 * Para cada atividade A01..A11 devolve:
 *   { nivel: 0..4|null, confianca, evidencias, revisar: bool }
 *
 * - nivel é limitado ao teto oficial da atividade (A04 = 3);
 * - confianca "baixa" ⇒ revisar = true (parecer lista p/ conferência humana);
 * - nivel null ⇒ ausência total (preenchedor aplica CONFIG.decisaoAusencia).
 */
export function avaliarAtividades(ctx) {
  const resultados = {};

  for (const [id, avaliador] of Object.entries(AVALIADORES)) {
    let r;
    try {
      r = avaliador(ctx);
    } catch (e) {
      r = {
        nivel: null,
        confianca: "baixa",
        evidencias: [`Erro interno do avaliador (${e.message}) — revisão humana.`],
      };
    }

    // Aplica o teto oficial da atividade
    const teto = CONFIG.nivelMaximo[id] ?? 4;
    if (r.nivel !== null && r.nivel > teto) {
      r.evidencias.push(`Nível ${r.nivel} rebaixado ao teto oficial ${teto} da atividade.`);
      r.nivel = teto;
    }

    r.revisar = r.confianca === "baixa";
    resultados[id] = r;
  }

  return resultados;
}
