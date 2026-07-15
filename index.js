import fs from "node:fs";
import path from "node:path";
import { gerarDashboard } from "./src/dashboard.js";
import { descobrirAlunos, avaliarAluno } from "./src/avaliadorCore.js";
import { CONFIG } from "./src/config.js";
import { statusLLM, limparCache } from "./src/llm.js";
import { gerarCSV } from "./src/csv.js";

const args = process.argv.slice(2);
const flag = (nome, padrao = null) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.split("=").slice(1).join("=") : padrao;
};
const temFlag = (nome) => args.includes(`--${nome}`);
const alvo = args.find((a) => !a.startsWith("--"));

if (!alvo || temFlag("ajuda") || temFlag("help")) {
  console.log(`
Avaliador SAEP — correção em lote

Uso:
  node index.js ./provas                    # todas as turmas (lote)
  node index.js ./provas/3B                 # uma turma
  node index.js ./provas/3B/joao            # um aluno

Opções:
  --auto                    modo autônomo: decide tudo, sem pedir revisão humana
  --llm=auto|fallback|off   auto = IA avalia todas as atividades (padrão)
  --alunos=3                alunos avaliados em paralelo (padrão: 3)
  --refazer                 reavalia quem já tem gabarito_avaliado.json
  --limpar-cache            descarta o cache de respostas da IA
  --sem-csv                 não gera o resultados.csv consolidado

Variáveis de ambiente:
  GROQ_API_KEY=gsk_...      chave da API (obrigatória p/ IA)
  LLM_MODEL=...             modelo de texto  (padrão: ${CONFIG.llm.modelo})
  LLM_VISION_MODEL=...      modelo de visão p/ o DER
  LLM_CONCORRENCIA=2        chamadas simultâneas à IA (respeite o rate limit)
`);
  process.exit(alvo ? 0 : 1);
}

if (flag("llm")) CONFIG.llm.modo = flag("llm");
if (temFlag("auto")) CONFIG.modoAutonomo = true;

if (CONFIG.modoAutonomo && CONFIG.llm.modo === "off") {
  console.error(
    "❌ --auto exige a IA ligada (é ela que decide os casos duvidosos).\n" +
    "   Defina GROQ_API_KEY ou remova --auto."
  );
  process.exit(1);
}
if (temFlag("limpar-cache")) { limparCache(); console.log("🗑️  Cache da IA limpo."); }

const alunosParalelo = Number(flag("alunos", 3));

let pastas = descobrirAlunos(alvo);
if (pastas.length === 0) {
  console.error("❌ Nenhuma pasta de aluno (com gabarito.json + codigo/) encontrada.");
  process.exit(1);
}

if (!temFlag("refazer")) {
  const antes = pastas.length;
  pastas = pastas.filter((p) => !fs.existsSync(path.join(p, "gabarito_avaliado.json")));
  const pulados = antes - pastas.length;
  if (pulados > 0) console.log(`↩️  ${pulados} aluno(s) já avaliado(s) — pulando (use --refazer para reavaliar).`);
}

if (pastas.length === 0) {
  console.log("✅ Nada a fazer.");
  process.exit(0);
}

console.log(`\n🤖 ${statusLLM()}`);
console.log(`📚 ${pastas.length} aluno(s) | ${alunosParalelo} em paralelo\n`);

const resultados = [];
const falhas = [];
let concluidos = 0;
const inicio = Date.now();

async function trabalhador(fila) {
  while (fila.length > 0) {
    const pasta = fila.shift();
    try {
      const r = await avaliarAluno(pasta);
      resultados.push(r);
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
  Array.from({ length: Math.min(alunosParalelo, fila.length) }, () => trabalhador(fila))
);

const raiz = fs.statSync(alvo).isDirectory() ? alvo : path.dirname(alvo);
const minutos = ((Date.now() - inicio) / 60000).toFixed(1);

if (resultados.length > 0) {
  gerarDashboard(resultados, raiz);
  console.log(`\n📊 Dashboard: ${path.join(raiz, "dashboard.html")}`);

  if (!temFlag("sem-csv")) {
    const csv = gerarCSV(resultados, raiz);
    console.log(`📄 Planilha:  ${csv}`);
  }
}

const revisar = resultados.filter((r) => r.parecer.totais.ambiguo > 0).length;
console.log(
  `\n✅ ${resultados.length} avaliado(s) em ${minutos} min` +
    (falhas.length ? ` | ❌ ${falhas.length} falha(s)` : "") +
    (revisar ? ` | ⚠️  ${revisar} aluno(s) com itens p/ revisão humana` : "")
);
if (falhas.length) {
  console.log("\nFalhas:");
  for (const f of falhas) console.log(`  ${f.pasta}: ${f.erro}`);
}
