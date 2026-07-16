import fs from "node:fs";
import path from "node:path";
import { varrerProjeto, categorizar } from "./scanner.js";
import { analisarBackend } from "./analisadores/backend.js";
import { analisarSQL } from "./analisadores/sql.js";
import { analisarFrontend } from "./analisadores/frontend.js";
import { localizarDER, analisarDER } from "./analisadores/der.js";
import { avaliarAtividades } from "./motorRegra.js";
import { revisarComLLM } from "./revisorLLM.js";
import { preencherGabarito } from "./preenchedor.js";
import { gerarParecer } from "./parecer.js";

export function descobrirAlunos(raiz) {
  const ehAluno = (p) =>
    fs.existsSync(path.join(p, "gabarito.json")) &&
    fs.existsSync(path.join(p, "codigo"));

  if (ehAluno(raiz)) return [raiz];

  const encontrados = [];
  (function varrer(dir, prof = 0) {
    if (prof > 3) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      if (ehAluno(p)) encontrados.push(p);
      else varrer(p, prof + 1);
    }
  })(raiz);
  return encontrados;
}

export async function avaliarAluno(pasta) {
  const aluno = carregarAluno(pasta);
  console.log(`👤 ${aluno.nome} — Turma ${aluno.turma}`);

  const pastaCodigo = path.join(pasta, "codigo");
  const arquivos = categorizar(varrerProjeto(pastaCodigo));

  // ── Análises técnicas ──
  const backend = analisarBackend(arquivos.backend);
  const sql = analisarSQL(arquivos.sql, arquivos.backend);
  const frontend = analisarFrontend(arquivos.frontend);
  const der = await analisarDER(localizarDER(pastaCodigo), sql);

  // ── Motor por níveis (DER entra no A03) ──
  let resultados = avaliarAtividades({ backend, sql, frontend, der });
  resultados = await revisarComLLM(resultados, arquivos, aluno);

  // ── Preenche o gabarito (reset + 1 SIM por atividade + sanidade) ──
  const gabaritoOriginal = JSON.parse(
    fs.readFileSync(path.join(pasta, "gabarito.json"), "utf-8")
  );
  const { gabarito: preenchido, problemas } = preencherGabarito(
    gabaritoOriginal,
    resultados
  );
  fs.writeFileSync(
    path.join(pasta, "gabarito_avaliado.json"),
    JSON.stringify(preenchido, null, 2),
    "utf-8"
  );

  if (problemas.length > 0) {
    console.warn(`   ‼ Problemas de preenchimento:\n     - ${problemas.join("\n     - ")}`);
  }

  // ── Parecer (mesma fonte de verdade do gabarito) ──
  const parecer = gerarParecer(aluno, resultados, der, sql, backend, problemas);
  fs.writeFileSync(path.join(pasta, "parecer.txt"), parecer.texto, "utf-8");

  console.log(
    `   ✅ ${parecer.totais.percentual}% | ` +
      `${parecer.totais.maxima}/${parecer.totais.total} no teto | ` +
      `${parecer.totais.tempo} não entregue(s) | ⚠️ ${parecer.totais.ambiguo} p/ revisão`
  );

  return { aluno, vereditos: resultados, der, sql, rotas: backend.rotas, parecer, gabarito: preenchido };
}

export function carregarAluno(pasta) {
  const arq = path.join(pasta, "aluno.json");
  if (fs.existsSync(arq)) {
    const dados = JSON.parse(fs.readFileSync(arq, "utf-8"));
    return { nome: dados.nome || "Sem nome", turma: normalizarTurma(dados.turma) };
  }
  const partes = pasta.split(path.sep);
  const turma = partes.findLast((p) => /^3[BC]$/i.test(p)) || "N/D";
  const nome = partes[partes.length - 1]
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { nome, turma: normalizarTurma(turma) };
}

function normalizarTurma(t) {
  const valor = String(t || "").trim();
  if (!valor) return "N/D";
  // Formato clássico "3B"/"3 C" é normalizado; qualquer outro nome é aceito como está
  const m = valor.toUpperCase().match(/^3\s*([A-Z])$/);
  return m ? `3${m[1]}` : valor;
}
