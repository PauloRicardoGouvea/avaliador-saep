/**
 * Avaliadores por atividade — retornam o NÍVEL do gabarito SAEP (0 a 4),
 * e não mais um veredito binário. Cada avaliador devolve:
 *   { nivel: 0..4 | null, confianca: "alta"|"media"|"baixa", evidencias: [] }
 *
 * nivel === null  → nenhum artefato encontrado (ausência total).
 * confianca baixa → o preenchedor marca o melhor palpite, mas a atividade
 *                   entra na lista de REVISÃO HUMANA do parecer.
 *
 * Filosofia (alinhada ao feedback da prova): a análise estática não
 * consegue provar execução; então provas de EXISTÊNCIA + estrutura decidem
 * o nível, e detalhes que dependem de rodar o código rebaixam a confiança,
 * nunca a nota, evitando punir o aluno por limitação da ferramenta.
 */

import { RE_MULTIPLICACAO } from "./analisadores/sql.js";

const RE_DATA_FORMATADA =
  /to_?char|date_format|tolocaledatestring|strftime|dayjs|moment|formatar?\w*\s*\(|padstart[\s\S]{0,40}getdate|getdate\(\)[\s\S]{0,80}getmonth|\d{2}-\d{2}-\d{4}|dd-mm-yyyy/i;

export const AVALIADORES = {
  /* ── A01: script de criação/população do banco ─────────────────── */
  A01({ sql }) {
    const ev = [];
    if (!sql.temCreateTable) return ausente(ev, "Nenhum CREATE TABLE encontrado.");
    ev.push(`${sql.qtdTabelas} tabela(s): ${sql.nomesTabelas.join(", ")}.`);

    const pkfk = sql.todasTemPK && sql.algumaFK;
    if (!pkfk) {
      ev.push(sql.todasTemPK ? "Sem chaves estrangeiras." : "Tabela(s) sem chave primária.");
      return { nivel: 2, confianca: "alta", evidencias: ev };
    }
    ev.push("Chaves primárias e estrangeiras presentes.");

    if (!sql.todasTem3Registros) {
      const faltam = sql.tabelas.filter((t) => t.registros < 3)
        .map((t) => `${t.nome} (${t.registros})`);
      ev.push(`Tabelas com menos de 3 registros: ${faltam.join(", ")}.`);
      return { nivel: 3, confianca: "alta", evidencias: ev };
    }
    ev.push("Todas as tabelas têm ≥ 3 registros inseridos.");
    return { nivel: 4, confianca: "alta", evidencias: ev };
  },

  /* ── A02: view vw_estoque ───────────────────────────────────────── */
  A02({ sql }) {
    const ev = [];
    const v = sql.viewEstoque;
    if (!v) return ausente(ev, "Nenhuma CREATE VIEW encontrada (nem no .sql nem no backend).");
    ev.push(`View encontrada: ${v.nome} (${v.qtdColunas} coluna(s) no SELECT).`);

    if (!v.temCalculo) {
      ev.push("SELECT sem multiplicação quantidade × valor unitário — cálculo do valor total ausente/errado.");
      return { nivel: 1, confianca: "media", evidencias: ev };
    }
    ev.push("Cálculo quantidade × valor unitário presente.");

    // Gabarito: 5+ colunas → nível 4 | 3–4 colunas → nível 3 | 2 → nível 2
    // SELECT * herda as colunas da tabela — tratamos como 5+ se a tabela tiver.
    let qtd = v.qtdColunas;
    if (v.colunas.some((c) => c.includes("*"))) qtd = Math.max(qtd, 5);
    const nivel = qtd >= 5 ? 4 : qtd >= 3 ? 3 : 2;
    if (nivel < 4) ev.push(`Apenas ${qtd} coluna(s) — gabarito exige 5 (id, nome, quantidade, valor unitário, valor total) para o nível 4.`);
    return { nivel, confianca: "alta", evidencias: ev };
  },

  /* ── A03: DER (o nível vem do analisador de DER) ───────────────── */
  A03({ der, sql }) {
    const ev = [...(der.evidencias || [])];
    if (!der.existe) return ausente(ev, "Nenhum arquivo de DER localizado no projeto.");

    // Caminho preferencial: a IA de visão leu o diagrama e atribuiu o nível.
    if (typeof der.nivel === "number") {
      return {
        nivel: der.nivel,
        confianca: der.revisar ? "baixa" : "media",
        evidencias: ev,
        fonte: "llm-visao",
      };
    }

    if (der.veredito === "MAXIMA") {
      // Nota: o gabarito nível 4 exige "vínculo do responsável pela operação",
      // que NÃO existe no enunciado da prova (apontado no doc de feedback).
      ev.push("Obs.: requisito 'responsável pela operação' do gabarito não consta na prova — desconsiderado (ver doc. de feedback).");
      return { nivel: 4, confianca: "media", evidencias: ev };
    }
    // DER existe mas não foi analisável automaticamente (imagem sem IA de visão):
    // melhor palpite = nível 3 se o banco está coerente, com revisão humana.
    const nivel = sql.todasTemPK && sql.algumaFK ? 3 : 2;
    ev.push("Conteúdo do DER requer validação manual (imagem não analisada — defina GROQ_API_KEY para análise automática).");
    return { nivel, confianca: "baixa", evidencias: ev };
  },

  /* ── A04: listar valor total via view (TETO = nível 3) ──────────── */
  A04({ backend, sql }) {
    const ev = [];
    const nomeView = sql.viewEstoque ? sql.viewEstoque.nome : "vw_estoque";
    const usaView = backend.localizar({
      nome: [/estoque|valor[_-]?total|categoria|total/i],
      corpo: [new RegExp(`from\\s+${nomeView}`, "i"), /vw[_-]?estoque/i],
    });
    if (usaView && new RegExp(`vw[_-]?estoque|${nomeView}`, "i").test(usaView.bloco.corpo)) {
      ev.push(`Função/rota consultando a view (${rotulo(usaView.bloco)}).`);
      ev.push("Nível 3 é o TETO desta atividade — o gabarito não possui nível 4 (falha do próprio documento de correção).");
      return { nivel: 3, confianca: "alta", evidencias: ev };
    }
    // Calcula sem view (SUM/GROUP BY direto no código) → nível 2 (previsto no gabarito)
    const semView = backend.localizar({
      nome: [/valor[_-]?total|categoria|total/i],
      corpo: [/SUM\s*\(/i, /GROUP\s+BY/i, RE_MULTIPLICACAO],
    });
    if (semView && (/SUM\s*\(|GROUP\s+BY/i.test(semView.bloco.corpo) || RE_MULTIPLICACAO.test(semView.bloco.corpo))) {
      ev.push(`Cálculo do valor total feito direto no código, sem uso da view (${rotulo(semView.bloco)}).`);
      return { nivel: 2, confianca: "media", evidencias: ev };
    }
    return ausente(ev, "Nenhuma função/rota de valor total (por item ou categoria) localizada.");
  },

  /* ── A05: listar todos os produtos ──────────────────────────────── */
  A05({ backend, sql }) {
    const ev = [];
    const alvo = backend.localizar({
      metodo: /get/i,
      nome: [/produto(?!.*(estoque|view|vw))/i, /listar|list|todos/i],
      corpo: [/SELECT\s+[\s\S]{0,120}FROM\s+produtos?/i],
    });
    if (!alvo) return ausente(ev, "Nenhuma rota/função de listagem de produtos localizada.");
    ev.push(`Listagem localizada (${rotulo(alvo.bloco)}).`);

    const campos = camposSelecionados(alvo.bloco.corpo, sql, "produto");
    // Gabarito: 3 campos principais → nível 2 | 4 campos → 3 | 6 campos → 4
    // ("unidade de medida" e "limites" são campos-fantasma da prova — ver feedback;
    //  por isso 4+ campos com confiança média, nunca punição automática)
    let nivel, conf;
    if (campos >= 6) { nivel = 4; conf = "media"; }
    else if (campos >= 4) { nivel = 3; conf = "media"; }
    else if (campos >= 3) { nivel = 2; conf = "alta"; }
    else { nivel = 2; conf = "baixa"; ev.push("Poucos campos identificados na consulta — conferir manualmente."); }
    ev.push(`~${campos} campo(s) retornado(s) na consulta.`);
    return { nivel, confianca: conf, evidencias: ev };
  },

  /* ── A06: cadastro de novo produto ──────────────────────────────── */
  A06({ backend }) {
    const ev = [];
    const alvo = backend.localizar({
      metodo: /post/i,
      nome: [/produto/i, /cadastr|criar|novo|add|insert/i],
      corpo: [/INSERT\s+INTO\s+[`"']?produtos?/i],
    });
    if (!alvo || !/INSERT\s+INTO/i.test(alvo.bloco.corpo)) {
      return ausente(ev, "Nenhuma função/rota de cadastro (INSERT em produto) localizada.");
    }
    ev.push(`Cadastro localizado (${rotulo(alvo.bloco)}).`);

    const corpo = alvo.bloco.corpo;
    const temValidacao =
      /if\s*\([\s\S]{0,120}(!|==\s*null|===\s*undefined|<=?\s*0|isNaN|typeof)/i.test(corpo) ||
      /\.(status\s*\(\s*4\d\d|send|reply)[\s\S]{0,80}(falta|inválid|invalid|obrigat)/i.test(corpo);
    const temDuplicidade =
      /SELECT[\s\S]{0,160}WHERE[\s\S]{0,80}(nome|denomina)/i.test(corpo) ||
      /UNIQUE/i.test(corpo) || /(já\s*existe|duplicad|duplicate)/i.test(corpo);
    const temTratamentoErro = /try\s*{|catch\s*\(|\.catch\s*\(|except\s*:/i.test(corpo);

    ev.push(`Validações de campos: ${temValidacao ? "sim" : "não"} | duplicidade: ${temDuplicidade ? "sim" : "não"} | try/catch: ${temTratamentoErro ? "sim" : "não"}.`);
    // Obs.: gabarito valida "denominação"; prova pedia "categoria" (conflito
    // documentado no feedback) — aceitamos qualquer validação de campos.
    if (temValidacao && temDuplicidade && temTratamentoErro)
      return { nivel: 4, confianca: "alta", evidencias: ev };
    if (temValidacao && !temTratamentoErro)
      return { nivel: 3, confianca: "alta", evidencias: ev };
    if (temValidacao && temTratamentoErro && !temDuplicidade) {
      ev.push("Falta apenas verificação de duplicidade (exigência que nem consta no enunciado — ver feedback). Conferir se merece nível 4.");
      return { nivel: 3, confianca: "baixa", evidencias: ev };
    }
    return { nivel: 2, confianca: "alta", evidencias: ev };
  },

  /* ── A07: listar saídas em ordem decrescente por data ───────────── */
  A07({ backend, sql }) {
    const ev = [];
    const alvo = backend.localizar({
      nome: [/saida|saída|out/i],
      corpo: [/FROM\s+[`"']?sa[ií]das?/i, /SELECT[\s\S]{0,200}sa[ií]da/i],
    });
    if (!alvo) return ausente(ev, "Nenhuma função/rota de listagem de saídas localizada.");
    ev.push(`Listagem de saídas localizada (${rotulo(alvo.bloco)}).`);

    const corpo = alvo.bloco.corpo;
    const ordenaDesc = /ORDER\s+BY[\s\S]{0,60}DESC/i.test(corpo) ||
      /\.sort\s*\([\s\S]{0,80}(-|b\s*[-.]\s*a|reverse)/i.test(corpo);
    const formataData = RE_DATA_FORMATADA.test(corpo);
    const campos = camposSelecionados(corpo, sql, "saida");

    ev.push(`Ordem decrescente: ${ordenaDesc ? "sim" : "não detectada"} | data formatada (25-12-2025): ${formataData ? "sim" : "não detectada"} | ~${campos} campo(s).`);
    if (!ordenaDesc) return { nivel: 2, confianca: "media", evidencias: ev };
    if (formataData && campos >= 4) return { nivel: 4, confianca: "media", evidencias: ev };
    // Formato de data e "6 campos" são exigências que não constam na regra de
    // negócio (ver feedback) — nível 3 com revisão, para o humano decidir.
    ev.push("Exigências de formato de data / 6 campos não constam no enunciado da prova (ver feedback) — avaliar concessão do nível 4.");
    return { nivel: 3, confianca: "baixa", evidencias: ev };
  },

  /* ── A08: entrada de itens no estoque ───────────────────────────── */
  A08({ backend }) {
    const ev = [];
    const alvo = backend.localizar({
      nome: [/entrada|in\b|registrar/i],
      corpo: [/INSERT\s+INTO\s+[`"']?entradas?/i, /UPDATE\s+[`"']?produtos?[\s\S]{0,120}(qtd|quant|estoque|saldo)\w*/i],
    });
    if (!alvo) return ausente(ev, "Nenhuma função/rota de entrada de estoque localizada.");
    ev.push(`Entrada localizada (${rotulo(alvo.bloco)}).`);

    const corpo = alvo.bloco.corpo;
    const registra = /INSERT\s+INTO/i.test(corpo);
    const atualizaSaldo =
      /UPDATE\s+[`"']?produtos?[\s\S]{0,160}(qtd|quant|estoque|saldo)\w*\s*=/i.test(corpo) ||
      /(qtd|quant|estoque|saldo)\w*\s*=\s*(qtd|quant|estoque|saldo)\w*\s*\+/i.test(corpo);
    const formataData = RE_DATA_FORMATADA.test(corpo);

    ev.push(`Registra entrada: ${registra ? "sim" : "não"} | atualiza saldo: ${atualizaSaldo ? "sim" : "não detectado"} | data formatada: ${formataData ? "sim" : "não detectada"}.`);
    if (registra && atualizaSaldo && formataData)
      return { nivel: 4, confianca: "media", evidencias: ev };
    if (registra && atualizaSaldo) {
      ev.push("Formato de data 25-12-2025 é exigência que não consta na regra de negócio (ver feedback) — avaliar concessão do nível 4.");
      return { nivel: 3, confianca: "baixa", evidencias: ev };
    }
    if (registra) return { nivel: 2, confianca: "media", evidencias: ev };
    return { nivel: 1, confianca: "baixa", evidencias: ev };
  },

  /* ── A09: relatório de entradas/saídas por período ──────────────── */
  A09({ backend, sql }) {
    const ev = [];
    const alvo = backend.localizar({
      nome: [/relat|period|moviment/i],
      corpo: [/BETWEEN/i, /(data|date)[\s\S]{0,30}(>=|<=)/, /data[_-]?inicial|data[_-]?final/i],
    });
    if (!alvo) return ausente(ev, "Nenhuma função/rota de relatório por período localizada.");
    ev.push(`Relatório por período localizado (${rotulo(alvo.bloco)}).`);

    const corpo = alvo.bloco.corpo;
    const somaFinanceiro = (corpo.match(/SUM\s*\(/gi) || []).length;
    const campos = Math.max(camposSelecionados(corpo, sql, null), somaFinanceiro + 2);
    ev.push(`~${campos} campo(s) no retorno | ${somaFinanceiro} agregação(ões) SUM.`);
    const nivel = campos >= 7 ? 4 : campos >= 4 ? 3 : 2;
    return { nivel, confianca: campos >= 7 ? "media" : "baixa", evidencias: ev };
  },

  /* ── A10: produtos com maior volume de saída no período ─────────── */
  A10({ backend }) {
    const ev = [];
    const alvo = backend.localizar({
      nome: [/maior|top|ranking|volume/i],
      corpo: [/GROUP\s+BY[\s\S]{0,200}ORDER\s+BY[\s\S]{0,80}DESC/i, /SUM\s*\([\s\S]{0,40}(qtd|quant)/i],
    });
    if (!alvo) return ausente(ev, "Nenhuma função/rota de maior volume de saída localizada.");
    ev.push(`Função de maior saída localizada (${rotulo(alvo.bloco)}).`);

    const corpo = alvo.bloco.corpo;
    const agrupa = /GROUP\s+BY/i.test(corpo);
    const ordenaDesc = /ORDER\s+BY[\s\S]{0,80}DESC/i.test(corpo);
    const somas = (corpo.match(/SUM\s*\(/gi) || []).length;
    ev.push(`GROUP BY: ${agrupa ? "sim" : "não"} | ORDER DESC: ${ordenaDesc ? "sim" : "não"} | ${somas} SUM (qtd total + valor financeiro = 2 esperados).`);
    if (agrupa && ordenaDesc && somas >= 2) return { nivel: 4, confianca: "alta", evidencias: ev };
    if (agrupa && ordenaDesc && somas === 1) return { nivel: 3, confianca: "media", evidencias: ev };
    if (agrupa || ordenaDesc) return { nivel: 2, confianca: "media", evidencias: ev };
    return { nivel: 1, confianca: "baixa", evidencias: ev };
  },

  /* ── A11: produtos nos limites mín (0) / máx (100) + percentual ─── */
  A11({ backend }) {
    const ev = [];
    const alvo = backend.localizar({
      nome: [/limite|nivel|nível|min|max|alerta/i],
      corpo: [/(<=?\s*0|>=?\s*100)/, /limite[_-]?(min|max)/i, /percentual|percent|%/i],
    });
    if (!alvo) return ausente(ev, "Nenhuma função/rota de verificação de limites de estoque localizada.");
    ev.push(`Verificação de limites localizada (${rotulo(alvo.bloco)}).`);

    const corpo = alvo.bloco.corpo;
    const temLimites = /(<=?\s*0|>=?\s*100|limite)/i.test(corpo);
    const temPercentual = /percentual|percent|\*\s*100|\/\s*100/i.test(corpo);
    ev.push(`Lógica de limites 0/100: ${temLimites ? "sim" : "não"} | percentual: ${temPercentual ? "sim" : "não"}.`);
    if (temLimites && temPercentual) {
      ev.push("Obs.: gabarito exige retorno de 4 campos específicos não descritos na prova (ver feedback) — conferir campos no retorno.");
      return { nivel: 4, confianca: "media", evidencias: ev };
    }
    if (temLimites) return { nivel: 3, confianca: "media", evidencias: ev };
    return { nivel: 1, confianca: "baixa", evidencias: ev };
  },
};

/* ── Helpers ──────────────────────────────────────────────────────── */

function ausente(ev, msg) {
  ev.push(msg);
  return { nivel: null, confianca: "alta", evidencias: ev };
}

const rotulo = (b) =>
  b.tipo === "rota" ? `rota ${b.metodo.toUpperCase()} ${b.path}` : `função ${b.nome}()`;

/**
 * Estima quantos campos a consulta retorna: conta a lista do SELECT;
 * SELECT * herda as colunas da tabela; JOIN soma as duas.
 */
function camposSelecionados(corpo, sql, tabelaPreferida) {
  const m = corpo.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
  if (!m) return 0;
  const lista = m[1].trim();
  if (lista.includes("*")) {
    if (!sql || !sql.tabelas) return 4;
    const t = tabelaPreferida
      ? sql.tabelas.find((x) => x.nome.toLowerCase().includes(tabelaPreferida))
      : null;
    if (t) return t.colunas.length;
    return Math.max(...sql.tabelas.map((x) => x.colunas.length), 4);
  }
  return lista.split(/,(?![^()]*\))/).filter((c) => c.trim()).length;
}
