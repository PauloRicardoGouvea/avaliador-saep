import path from "node:path";
import fs from "node:fs";
import { CONFIG } from "../config.js";
import { pedirJSON, llmAtivo } from "../llm.js";

const EXTENSOES_DER = [".png", ".jpg", ".jpeg", ".pdf", ".drawio", ".brM", ".mwb", ".svg", ".vpp", ".erd"];
const NOMES_DER = /(der|mer|diagrama|modelo|entidade|relacionamento|eer|conceitual|logico|lógico)/i;

/**
 * Avalia o DER em 3 níveis:
 * 1. Existência do arquivo (heurística por extensão/nome);
 * 2. Análise textual (drawio/svg são XML — dá pra ler entidades!);
 * 3. Visão por LLM (opcional) para imagens png/jpg/pdf.
 */
export function localizarDER(dirCodigo) {
  const encontrados = [];

  function varrer(dir) {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    for (const e of entradas) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== ".git") varrer(caminho);
        continue;
      }
      const ext = path.extname(e.name).toLowerCase();
      const pareceDER =
        EXTENSOES_DER.includes(ext) &&
        (NOMES_DER.test(e.name) || [".drawio", ".brM", ".mwb", ".erd", ".vpp"].includes(ext) ||
         // Qualquer imagem no projeto de prova provavelmente é o DER
         [".png", ".jpg", ".jpeg", ".pdf"].includes(ext));
      if (pareceDER) encontrados.push({ caminho, nome: e.name, ext });
    }
  }

  varrer(dirCodigo);
  return encontrados;
}

/**
 * Analisa o DER e retorna avaliação estrutural.
 * Aceita qualquer notação (Crow's Foot ou Chen) — a notação não
 * importa, o que importa é existência de entidades e relacionamentos.
 */
export async function analisarDER(arquivosDER, sql) {
  if (arquivosDER.length === 0) {
    return {
      existe: false,
      notacao: null,
      entidades: [],
      analiseVisual: false,
      veredito: "ESTOURO_TEMPO",
      evidencias: ["Nenhum arquivo de DER encontrado no projeto."],
    };
  }

  const evidencias = [`DER encontrado: ${arquivosDER.map((a) => a.nome).join(", ")}`];

  // ── Nível 2: arquivos XML legíveis (drawio, svg) ──
  const legivel = arquivosDER.find((a) => [".drawio", ".svg", ".erd"].includes(a.ext));
  if (legivel) {
    const xml = fs.readFileSync(legivel.caminho, "utf-8");
    const textos = [...xml.matchAll(/value="([^"]{2,40})"|>([^<>{2,40}]+)</g)]
      .map((m) => (m[1] || m[2] || "").trim())
      .filter(Boolean);

    // Cruza nomes do DER com tabelas do SQL (correção generosa: match parcial)
    const tabelasSQL = sql.nomesTabelas || [];
    const coincidentes = tabelasSQL.filter((t) =>
      textos.some((txt) => txt.toLowerCase().includes(t.toLowerCase()) ||
                           t.toLowerCase().includes(txt.toLowerCase()))
    );

    // Detecta notação por pistas do XML
    const notacao = /ERone|ERmany|crow/i.test(xml)
      ? "Crow's Foot"
      : /rhombus|losango|diamond/i.test(xml)
        ? "Chen"
        : "Indeterminada (ambas aceitas)";

    evidencias.push(
      `Notação detectada: ${notacao}.`,
      `Entidades do DER coerentes com o SQL: ${coincidentes.length}/${tabelasSQL.length} tabelas.`
    );

    return {
      existe: true,
      notacao,
      entidades: coincidentes,
      analiseVisual: true,
      veredito: coincidentes.length > 0 || tabelasSQL.length === 0 ? "MAXIMA" : "AMBIGUO",
      evidencias,
    };
  }

  // ── Nível 3: imagem — tenta LLM com visão, senão revisão humana ──
  const imagem = arquivosDER.find((a) => [".png", ".jpg", ".jpeg"].includes(a.ext));
  if (imagem && llmAtivo()) {
    try {
      const resultado = await analisarImagemDER(imagem, sql);
      evidencias.push(...resultado.evidencias);
      return { existe: true, ...resultado, evidencias };
    } catch (e) {
      evidencias.push(`Falha na análise visual (${e.message}).`);
    }
  }

  // Correção Generosa: DER existe, formato não analisável automaticamente
  evidencias.push(
    "Arquivo de DER presente, análise automática indisponível — " +
      "presença conta como entrega; conteúdo pendente de revisão humana."
  );
  return {
    existe: true,
    notacao: "Não analisada",
    entidades: [],
    analiseVisual: false,
    veredito: "AMBIGUO",
    evidencias,
  };
}

async function analisarImagemDER(imagem, sql) {
  const base64 = fs.readFileSync(imagem.caminho).toString("base64");
  const mime = imagem.ext === ".png" ? "image/png" : "image/jpeg";
  const tabelas = (sql.nomesTabelas || []).join(", ") || "(nenhuma detectada)";
  const d = CONFIG.descritores.A03;

  const parsed = await pedirJSON(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Avalie este Diagrama Entidade-Relacionamento (DER) de um aluno do SAEP.",
              "Aceite QUALQUER notação (Crow's Foot, Chen, UML) — a notação não importa.",
              `Tabelas que ele criou no SQL: ${tabelas}.`,
              "",
              "Atribua o nível conforme os descritores oficiais:",
              `Nível 0: ${d[0]}`,
              `Nível 1: ${d[1]}`,
              `Nível 2: ${d[2]}`,
              `Nível 3: ${d[3]}`,
              `Nível 4: ${d[4]}`,
              "",
              `ATENÇÃO: ${CONFIG.requisitosFantasma.A03}`,
              "",
              'Responda APENAS JSON: {"nivel":<0-4>,"notacao":"...","entidades":["..."],"elementos_encontrados":["..."],"obs":"<1 frase>","revisar_humano":<bool>}',
            ].join("\n"),
          },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      },
    ],
    {
      modelo: CONFIG.llm.modeloVisao,
      chaveCache: `A03-visao::${imagem.nome}::${base64.slice(0, 2000)}`,
      maxTokens: 400,
    }
  );

  const nivel = Math.min(Math.max(parseInt(parsed.nivel, 10) || 0, 0), 4);
  return {
    nivel,
    veredito: nivel >= 4 ? "MAXIMA" : "PARCIAL",
    notacao: parsed.notacao || "Indeterminada",
    entidades: parsed.entidades || [],
    analiseVisual: true,
    revisar: Boolean(parsed.revisar_humano),
    evidencias: [
      `Análise visual da IA (nível ${nivel}): ${parsed.obs}`,
      parsed.elementos_encontrados?.length
        ? `Elementos identificados: ${parsed.elementos_encontrados.join(", ")}.`
        : null,
    ].filter(Boolean),
  };
}
