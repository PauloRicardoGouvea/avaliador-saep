import { CONFIG } from "./config.js";

/**
 * Parecer pedagógico por níveis (0–4), com seção explícita de
 * REVISÃO HUMANA — o parecer nunca mais contradiz o gabarito preenchido,
 * pois ambos derivam da mesma estrutura `resultados`.
 */
export function gerarParecer(aluno, resultados, der, sql, backend, problemas = []) {
  const totais = contarTotais(resultados);
  const frases = [];

  // ── Abertura ──
  const pct = totais.percentual;
  const nome = primeiroNome(aluno.nome);
  if (pct >= 90) frases.push(`${nome} entregou as funcionalidades avaliadas em nível máximo ou próximo dele, demonstrando domínio do fluxo banco → backend.`);
  else if (pct >= 70) frases.push(`${nome} apresentou desempenho sólido, com a maior parte das funcionalidades em níveis altos do gabarito.`);
  else if (pct >= 40) frases.push(`${nome} demonstrou compreensão parcial do projeto, com implementações funcionais em parte das atividades.`);
  else frases.push(`${nome} concluiu poucas funcionalidades no nível esperado dentro do tempo de prova.`);

  // ── Banco ──
  if (sql.temCreateTable) {
    let f = `No banco, estruturou ${sql.qtdTabelas} tabela(s) (${sql.nomesTabelas.join(", ")})`;
    if (sql.todasTemPK && sql.algumaFK) f += ` com PKs e FKs definidas`;
    else if (sql.temPK) f += ` com PKs, mas sem relacionamento via FK`;
    if (sql.temView) f += `; criou view (${sql.nomesViews.join(", ")})`;
    frases.push(f + ".");
  } else {
    frases.push("O script SQL não foi localizado ou não contém criação de tabelas.");
  }

  // ── Backend ──
  if (backend.rotas.length > 0) {
    const verbos = [...new Set(backend.rotas.map((r) => r.metodo.toUpperCase()))];
    frases.push(`No backend, implementou ${backend.rotas.length} rota(s) (${verbos.join(", ")}) e ${backend.funcoes.length} função(ões) nomeada(s).`);
  } else if (backend.funcoes.length > 0) {
    frases.push(`No backend, a entrega foi via funções no console (${backend.funcoes.length} função(ões) localizadas) — formato aceito pela prova.`);
  } else {
    frases.push("Nenhuma rota ou função foi identificada no backend.");
  }

  // ── Quadro de níveis ──
  const linhas = Object.entries(resultados).map(([id, r]) => {
    const teto = CONFIG.nivelMaximo[id] ?? 4;
    const nivelTxt = r.nivel === null ? "não entregue" : `nível ${r.nivel}/${teto}`;
    const marca = r.revisar ? " ⚠ revisar" : "";
    return `  ${id} ${CONFIG.nomesAtividades[id]}: ${nivelTxt}${marca}`;
  });

  // ── Bugs de execução detectados pela IA ──
  const bugs = Object.entries(resultados)
    .filter(([, r]) => Array.isArray(r.bugs) && r.bugs.length > 0)
    .flatMap(([id, r]) => r.bugs.map((b) => `  ${id}: ${b}`));

  // ── Pendências de revisão humana ──
  const revisar = Object.entries(resultados)
    .filter(([, r]) => r.revisar)
    .map(([id, r]) => `  ${id}: ${r.evidencias[r.evidencias.length - 1]}`);

  const partes = [
    frases.join(" "),
    "",
    "QUADRO DE NÍVEIS:",
    ...linhas,
  ];

  if (bugs.length > 0) {
    partes.push("", "🐞 BUGS QUE IMPEDEM A EXECUÇÃO:", ...bugs);
  }
  if (revisar.length > 0) {
    partes.push("", "⚠ REVISÃO HUMANA RECOMENDADA:", ...revisar);
  }

  // No modo autônomo as dúvidas viram observações (a nota já foi decidida)
  const obs = Object.entries(resultados)
    .filter(([, r]) => r.observacao)
    .map(([id, r]) => `  ${id}: ${r.observacao}`);
  if (obs.length > 0) {
    partes.push("", "📝 OBSERVAÇÕES (nota já atribuída):", ...obs);
  }
  if (problemas.length > 0) {
    partes.push("", "‼ PROBLEMAS DE PREENCHIMENTO DO GABARITO:", ...problemas.map((p) => `  ${p}`));
  }

  return { texto: partes.join("\n"), totais };
}

function contarTotais(resultados) {
  const lista = Object.entries(resultados);
  let soma = 0, somaTeto = 0, noTeto = 0, ausentes = 0, revisar = 0;
  for (const [id, r] of lista) {
    const teto = CONFIG.nivelMaximo[id] ?? 4;
    somaTeto += teto;
    if (r.nivel === null) ausentes++;
    else {
      soma += r.nivel;
      if (r.nivel >= teto) noTeto++;
    }
    if (r.revisar) revisar++;
  }
  return {
    total: lista.length,
    maxima: noTeto,                                  // compat. dashboard
    tempo: ausentes,                                 // compat. dashboard
    ambiguo: revisar,                                // compat. dashboard
    percentual: Math.round((soma / somaTeto) * 100), // nota proporcional aos níveis
  };
}

const primeiroNome = (nome) => (nome || "O estudante").split(" ")[0];
