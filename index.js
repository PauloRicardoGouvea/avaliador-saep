#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { gerarDashboard } from "./src/dashboard.js";
import { descobrirAlunos, avaliarAluno } from "./src/avaliadorCore.js";
import { CONFIG } from "./src/config.js";
import { statusLLM, limparCache, llmAtivo } from "./src/llm.js";
import { gerarCSV } from "./src/csv.js";
import { prepararEntregas } from "./src/preparador.js";

/* ── Argumentos ────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const flag = (nome, padrao = null) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.split("=").slice(1).join("=") : padrao;
};
const temFlag = (nome) => args.includes(`--${nome}`);
const posicionais = args.filter((a) => !a.startsWith("--"));

// Subcomando: preparar | avaliar | tudo — padrão "avaliar" (compatível com antes)
const SUBCOMANDOS = ["preparar", "avaliar", "tudo"];
const subcomando = SUBCOMANDOS.includes(posicionais[0]) ? posicionais.shift() : "avaliar";
const alvo = posicionais[0];

function ajuda() {
  console.log(`
Avaliador SAEP — pipeline de correção em massa

FLUXO COMPLETO (um comando faz tudo):
  node index.js tudo ./entregas --turma=3B --auto
    1. extrai os zips/pastas de ./entregas
    2. monta provas/3B/<aluno>/{codigo, gabarito.json, aluno.json}
    3. avalia todo mundo com a IA
    4. gera gabarito_avaliado.json + parecer.txt por aluno,
       dashboard.html e resultados.csv consolidados

ETAPAS SEPARADAS:
  node index.js preparar ./entregas --turma=3B      só monta a estrutura
  node index.js avaliar ./provas --auto             só avalia (padrão)
  node index.js ./provas --auto                     idem (retrocompatível)

Opções:
  --turma=3B                turma de destino (preparar/tudo)
  --destino=./provas        raiz da estrutura (padrão: ./provas)
  --auto                    modo autônomo: decide tudo, sem pedir revisão humana
  --llm=auto|fallback|off   auto = IA avalia todas as atividades (padrão)
  --alunos=3                alunos avaliados em paralelo
  --refazer                 reavalia quem já tem gabarito_avaliado.json
  --limpar-cache            descarta o cache de respostas da IA
  --sem-csv                 não gera o resultados.csv consolidado

Variáveis de ambiente:
  GROQ_API_KEY=gsk_...      chave da API (obrigatória p/ IA)
  LLM_MODEL / LLM_VISION_MODEL / LLM_CONCORRENCIA / SAEP_AUSENCIA
`);
}

if (!alvo || temFlag("ajuda") || temFlag("help")) {
  ajuda();
  process.exit(alvo ? 0 : 1);
}

if (flag("llm")) CONFIG.llm.modo = flag("llm");
if (temFlag("auto")) CONFIG.modoAutonomo = true;
if (temFlag("limpar-cache")) { limparCache(); console.log("🗑️  Cache da IA limpo."); }

if (CONFIG.modoAutonomo && CONFIG.llm.modo === "off") {
  console.error("❌ --auto exige a IA ligada (defina GROQ_API_KEY ou remova --auto).");
  process.exit(1);
}
if (CONFIG.modoAutonomo && !llmAtivo()) {
  console.error("❌ --auto exige GROQ_API_KEY definida no ambiente.");
  process.exit(1);
}

const destino = flag("destino", "./provas");
const turma = flag("turma");

/* ═══ ETAPA 1: PREPARAR ═══════════════════════════════════════════ */
let raizAvaliacao = alvo;

if (subcomando === "preparar" || subcomando === "tudo") {
  if (!turma) {
    console.error('❌ Informe a turma: --turma=3B (ela vira a pasta provas/3B/).');
    process.exit(1);
  }
  console.log(`\n📥 Preparando entregas de ${alvo} → ${path.join(destino, turma)}\n`);
  const rel = prepararEntregas(alvo, destino, turma);

  for (const p of rel.preparados) {
    const extra = p.descartados ? ` — ${p.descartados} de node_modules/lixo descartados` : "";
    console.log(`   ✚ ${p.nome} (${p.arquivos} arquivo(s) de código${extra})`);
  }
  for (const p of rel.pulados) console.log(`   ↩︎ ${p} — já preparado, pulando`);
  for (const i of rel.ignorados) console.log(`   ∅ ${i} — ignorado (não é zip nem pasta)`);
  for (const e of rel.erros) console.log(`   ❌ ${e.item}: ${e.erro}`);

  console.log(
    `\n   ${rel.preparados.length} preparado(s), ${rel.pulados.length} pulado(s), ${rel.erros.length} erro(s)`
  );

  if (subcomando === "preparar") process.exit(rel.erros.length ? 1 : 0);
  raizAvaliacao = path.join(destino, turma);
}

/* ═══ ETAPA 2: AVALIAR ════════════════════════════════════════════ */
let pastas = descobrirAlunos(raizAvaliacao);
if (pastas.length === 0) {
  console.error("❌ Nenhuma pasta de aluno (com gabarito.json + codigo/) encontrada.");
  process.exit(1);
}

if (!temFlag("refazer")) {
  const antes = pastas.length;
  pastas = pastas.filter((p) => !fs.existsSync(path.join(p, "gabarito_avaliado.json")));
  const pulados = antes - pastas.length;
  if (pulados > 0) console.log(`↩️  ${pulados} aluno(s) já avaliado(s) — pulando (use --refazer p/ reavaliar).`);
}

if (pastas.length === 0) {
  console.log("✅ Nada a avaliar.");
  process.exit(0);
}

console.log(`\n🤖 ${statusLLM()}`);
if (CONFIG.modoAutonomo) console.log("🚀 Modo autônomo: sem pendências de revisão humana.");
console.log(`📚 ${pastas.length} aluno(s) | ${Number(flag("alunos", 3))} em paralelo\n`);

const resultados = [];
const falhas = [];
let concluidos = 0;
const inicio = Date.now();

async function trabalhador(fila) {
  while (fila.length > 0) {
    const pasta = fila.shift();
    try {
      resultados.push(await avaliarAluno(pasta));
    } catch (e) {
      falhas.push({ pasta, erro: e.message });
      console.error(`❌ Falha em ${pasta}: ${e.message}`);
    } finally {
      concluidos++;
      process.stdout.write(`   [${concluidos}/${pastas.length}] concluídos\n`);
    }
  }
}

const fila = [...pastas];
await Promise.all(
  Array.from({ length: Math.min(Number(flag("alunos", 3)), fila.length) }, () =>
    trabalhador(fila)
  )
);

/* ═══ ETAPA 3: CONSOLIDAR ═════════════════════════════════════════ */
const raiz = fs.statSync(raizAvaliacao).isDirectory() ? raizAvaliacao : path.dirname(raizAvaliacao);
const minutos = ((Date.now() - inicio) / 60000).toFixed(1);

if (resultados.length > 0) {
  gerarDashboard(resultados, raiz);
  console.log(`\n📊 Dashboard: ${path.join(raiz, "dashboard.html")}`);
  if (!temFlag("sem-csv")) {
    console.log(`📄 Planilha:  ${gerarCSV(resultados, raiz)}`);
  }
}

const comBugs = resultados.filter((r) =>
  Object.values(r.vereditos).some((v) => v.bugs?.length > 0)
).length;
const revisar = resultados.filter((r) => r.parecer.totais.ambiguo > 0).length;

console.log(
  `\n✅ ${resultados.length} avaliado(s) em ${minutos} min` +
    (comBugs ? ` | 🐞 ${comBugs} com bugs de execução` : "") +
    (falhas.length ? ` | ❌ ${falhas.length} falha(s)` : "") +
    (revisar ? ` | ⚠️  ${revisar} com itens p/ revisão` : "")
);
for (const f of falhas) console.log(`  ❌ ${f.pasta}: ${f.erro}`);
