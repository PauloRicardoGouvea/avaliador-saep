import { CONFIG } from "./config.js";
import { pedirJSON, truncarCodigo, llmAtivo } from "./llm.js";

/**
 * Revisor LLM: decide o NÍVEL de cada atividade usando os DESCRITORES
 * OFICIAIS do gabarito (CONFIG.descritores).
 *
 * modo "auto"     → revisa todas as atividades que têm código entregue
 * modo "fallback" → revisa só as de baixa confiança da análise estática
 * modo "off"      → não faz nada
 *
 * A análise estática entra no prompt como PISTA, não como verdade — a LLM
 * enxerga o que o regex não vê (SQL quebrado, cálculo errado, lógica invertida).
 */
export async function revisarComLLM(resultados, arquivos, aluno) {
  if (!llmAtivo()) {
    const duvidosos = Object.values(resultados).filter((r) => r.revisar).length;
    if (duvidosos > 0 && CONFIG.llm.modo !== "off") {
      console.warn(
        `   ⚠️  ${duvidosos} atividade(s) de baixa confiança sem revisão de IA ` +
          `(defina GROQ_API_KEY para revisar automaticamente).`
      );
    }
    return resultados;
  }

  // A03 (DER) fica de fora: o diagrama é imagem/XML, não está no pacote de
  // código — quem avalia é a IA de visão em analisadores/der.js.
  const alvos = Object.entries(resultados).filter(([id, r]) =>
    id !== "A03" &&
    (CONFIG.llm.modo === "auto" ? r.nivel !== null : r.revisar && r.nivel !== null)
  );
  if (alvos.length === 0) return resultados;

  const codigo = montarCodigo(arquivos);

  // Concorrência é controlada dentro de src/llm.js
  await Promise.all(
    alvos.map(([id, r]) => revisarAtividade(id, r, codigo, aluno))
  );

  return resultados;
}

async function revisarAtividade(id, r, codigo, aluno) {
  const teto = CONFIG.nivelMaximo[id] ?? 4;
  const descritores = CONFIG.descritores[id] || {};
  const fantasma = CONFIG.requisitosFantasma[id];

  const listaNiveis = Object.entries(descritores)
    .filter(([n]) => Number(n) <= teto)
    .map(([n, txt]) => `Nível ${n}: ${txt}`)
    .join("\n");

  const sistema = [
    "Você é avaliador da prova prática SAEP (Técnico em Desenvolvimento de Sistemas).",
    "Sua tarefa: atribuir o NÍVEL do gabarito oficial à atividade indicada, com base no código do aluno.",
    "",
    "REGRAS DE JULGAMENTO:",
    "1. Use SOMENTE os descritores oficiais fornecidos. Não invente critérios de qualidade.",
    "2. Julgue se o código REALMENTE FUNCIONARIA. Erros que impedem execução (SQL com sintaxe inválida, coluna inexistente, tabela errada, variável não definida) rebaixam para os níveis 0/1 conforme o descritor.",
    "3. Nomes fora do padrão (português, abreviações) NÃO são erro. O aluno pode nomear como quiser.",
    "4. A entrega pode ser via rota HTTP, função no console ou script — todas são válidas pela prova.",
    CONFIG.modoAutonomo
      ? "5. Se o único motivo para rebaixar for um REQUISITO FANTASMA (listado abaixo, quando houver), NÃO rebaixe: atribua o nível superior e explique no motivo."
      : "5. Se o único motivo para rebaixar for um REQUISITO FANTASMA (listado abaixo, quando houver), atribua o nível superior e marque revisar_humano=true explicando.",
    CONFIG.modoAutonomo
      ? "6. VOCÊ DEVE DECIDIR. Não existe revisão humana. Na dúvida entre dois níveis, escolha o que o descritor descreve com mais fidelidade; se ainda empatar, escolha o menor. Sempre responda revisar_humano=false."
      : "6. Na dúvida entre dois níveis, escolha o menor e marque revisar_humano=true.",
    "",
    "Responda APENAS JSON válido, sem markdown.",
  ].join("\n");

  const usuario = [
    `ATIVIDADE ${id} — ${CONFIG.nomesAtividades[id]}`,
    "",
    "DESCRITORES OFICIAIS DO GABARITO:",
    listaNiveis,
    `(Teto desta atividade: nível ${teto}.)`,
    "",
    fantasma ? `REQUISITO FANTASMA (está no gabarito mas NÃO no enunciado da prova): ${fantasma}` : "",
    "",
    "PISTAS DA ANÁLISE ESTÁTICA (podem estar erradas — confirme no código):",
    r.evidencias.map((e) => `- ${e}`).join("\n"),
    "",
    "CÓDIGO DO ALUNO:",
    codigo,
    "",
    "Responda no formato:",
    `{"nivel": <0-${teto}>, "motivo": "<1-2 frases objetivas>", "revisar_humano": <true|false>, "bugs_execucao": ["<bug que impede rodar, se houver>"]}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const parsed = await pedirJSON(
      [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
      { chaveCache: `${id}::${aluno.nome}::${codigo}`, maxTokens: 400 }
    );

    let nivel = parseInt(parsed.nivel, 10);
    if (Number.isNaN(nivel)) throw new Error("campo 'nivel' inválido");
    nivel = Math.min(Math.max(nivel, 0), teto);

    const divergiu = nivel !== r.nivel;
    r.nivelEstatico = r.nivel;
    r.nivel = nivel;
    r.confianca = parsed.revisar_humano ? "baixa" : "media";
    r.revisar = CONFIG.modoAutonomo ? false : Boolean(parsed.revisar_humano);
    if (CONFIG.modoAutonomo && parsed.revisar_humano) {
      r.observacao = parsed.motivo; // vira observação, não pendência
    }
    r.fonte = "llm";

    r.evidencias.push(
      `IA (nível ${nivel}${divergiu ? `, análise estática dizia ${r.nivelEstatico}` : ""}): ${parsed.motivo}`
    );

    if (Array.isArray(parsed.bugs_execucao) && parsed.bugs_execucao.length > 0) {
      r.bugs = parsed.bugs_execucao;
      for (const b of parsed.bugs_execucao) {
        r.evidencias.push(`🐞 Bug de execução: ${b}`);
      }
    }
  } catch (e) {
    r.evidencias.push(`Falha na revisão por IA (${e.message}) — mantido o nível da análise estática.`);
    r.revisar = true;
  }
}

function montarCodigo(arquivos) {
  const relevantes = [...arquivos.sql, ...arquivos.backend];
  const usar = relevantes.length > 0 ? relevantes : arquivos.todos;
  const texto = usar
    .map((a) => `/* ===== ARQUIVO: ${a.relativo} ===== */\n${a.conteudo}`)
    .join("\n\n");
  return truncarCodigo(texto);
}
