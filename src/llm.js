import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG } from "./config.js";

/**
 * Cliente LLM compatível com OpenAI (padrão: Groq).
 * Recursos: retry com backoff, respeito ao 429/Retry-After, timeout,
 * limitador de concorrência global e cache em disco.
 */

const L = CONFIG.llm;

export const llmAtivo = () => L.modo !== "off" && Boolean(L.apiKey);

export function statusLLM() {
  if (L.modo === "off") return "LLM desativada (--llm=off)";
  if (!L.apiKey) return "LLM indisponível: defina GROQ_API_KEY (veja README)";
  return `LLM ativa — ${L.modelo} @ ${L.baseURL} (modo: ${L.modo})`;
}

/* ── Limitador de concorrência (sem dependência externa) ────────── */

let emExecucao = 0;
const fila = [];

function agendar(fn) {
  return new Promise((resolve, reject) => {
    fila.push({ fn, resolve, reject });
    drenar();
  });
}

function drenar() {
  while (emExecucao < L.concorrencia && fila.length > 0) {
    const { fn, resolve, reject } = fila.shift();
    emExecucao++;
    fn()
      .then(resolve, reject)
      .finally(() => {
        emExecucao--;
        drenar();
      });
  }
}

/* ── Cache em disco ─────────────────────────────────────────────── */

const hash = (txt) => crypto.createHash("sha256").update(txt).digest("hex").slice(0, 32);

function caminhoCache(chave) {
  return path.join(process.cwd(), L.pastaCache, `${chave}.json`);
}

function lerCache(chave) {
  if (!L.cache) return null;
  try {
    return JSON.parse(fs.readFileSync(caminhoCache(chave), "utf-8"));
  } catch {
    return null;
  }
}

function gravarCache(chave, valor) {
  if (!L.cache) return;
  try {
    fs.mkdirSync(path.join(process.cwd(), L.pastaCache), { recursive: true });
    fs.writeFileSync(caminhoCache(chave), JSON.stringify(valor), "utf-8");
  } catch { /* cache é best-effort */ }
}

export function limparCache() {
  const dir = path.join(process.cwd(), L.pastaCache);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ── Chamada principal ──────────────────────────────────────────── */

/**
 * Envia mensagens ao LLM e devolve JSON já parseado.
 * @param {Array} mensagens  formato OpenAI
 * @param {object} opts      { modelo, chaveCache, maxTokens }
 */
export async function pedirJSON(mensagens, opts = {}) {
  const modelo = opts.modelo || L.modelo;
  const chave = opts.chaveCache
    ? hash(`${modelo}::${opts.chaveCache}`)
    : hash(`${modelo}::${JSON.stringify(mensagens)}`);

  const cacheado = lerCache(chave);
  if (cacheado) return { ...cacheado, _cache: true };

  const resultado = await agendar(() =>
    chamarComRetry(mensagens, modelo, opts.maxTokens || 400)
  );

  gravarCache(chave, resultado);
  return resultado;
}

async function chamarComRetry(mensagens, modelo, maxTokens) {
  let ultimoErro;

  for (let tentativa = 1; tentativa <= L.tentativas; tentativa++) {
    try {
      const resposta = await chamarAPI(mensagens, modelo, maxTokens);
      return extrairJSON(resposta);
    } catch (e) {
      ultimoErro = e;

      // Erros definitivos: não adianta repetir
      if (e.status === 401 || e.status === 403) {
        throw new Error(
          `Chave de API rejeitada (HTTP ${e.status}). Confira GROQ_API_KEY.`
        );
      }
      if (e.status === 404) {
        throw new Error(
          `Modelo "${modelo}" não encontrado (HTTP 404). ` +
            `Defina outro em LLM_MODEL — veja os modelos ativos em https://console.groq.com/docs/models`
        );
      }

      if (tentativa === L.tentativas) break;

      // 429/5xx/rede → espera e tenta de novo
      const espera = e.retryAfter
        ? e.retryAfter * 1000
        : Math.min(2 ** tentativa * 1000, 20000) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, espera));
    }
  }

  throw ultimoErro;
}

async function chamarAPI(mensagens, modelo, maxTokens) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), L.timeoutMs);

  try {
    const res = await fetch(`${L.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${L.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        messages: mensagens,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: controlador.signal,
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      const erro = new Error(`HTTP ${res.status} — ${corpo.slice(0, 300)}`);
      erro.status = res.status;
      const ra = res.headers.get("retry-after");
      if (ra) erro.retryAfter = Number(ra);
      throw erro;
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

function extrairJSON(texto) {
  const limpo = String(texto).replace(/```json?|```/g, "").trim();
  try {
    return JSON.parse(limpo);
  } catch {
    // Última tentativa: recorta do primeiro { ao último }
    const i = limpo.indexOf("{");
    const f = limpo.lastIndexOf("}");
    if (i !== -1 && f > i) return JSON.parse(limpo.slice(i, f + 1));
    throw new Error(`Resposta não-JSON do modelo: ${limpo.slice(0, 120)}`);
  }
}

/** Trunca código preservando início e fim (onde costumam estar as rotas) */
export function truncarCodigo(texto, limite = L.maxCaracteresCodigo) {
  if (texto.length <= limite) return texto;
  const metade = Math.floor(limite / 2);
  return (
    texto.slice(0, metade) +
    `\n\n/* ...[${texto.length - limite} caracteres omitidos]... */\n\n` +
    texto.slice(-metade)
  );
}
