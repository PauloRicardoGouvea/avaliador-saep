import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { CONFIG } from "./config.js";

/**
 * PREPARADOR — transforma as entregas brutas dos alunos na estrutura
 * que o avaliador espera, sem nenhum trabalho manual:
 *
 *   entregas/                        provas/3B/
 *     Vinicius Ferreira.zip    →       vinicius_ferreira/
 *     João da Silva/                     aluno.json        (gerado)
 *     maria-souza.zip                    gabarito.json     (do template, zerado)
 *                                        codigo/           (zip extraído)
 *
 * Regras:
 *  - Aceita .zip OU pasta solta por aluno;
 *  - O nome do arquivo/pasta vira o nome do aluno (acentos preservados no
 *    aluno.json; a pasta é normalizada: minúsculas, sem acento, underscores);
 *  - Zips com uma única pasta raiz ("projeto/...") são achatados;
 *  - node_modules, .git etc. não são extraídos;
 *  - Aluno já preparado é pulado (idempotente — pode rodar de novo).
 */
export function prepararEntregas(pastaEntregas, destino, turma) {
  if (!fs.existsSync(pastaEntregas)) {
    throw new Error(`Pasta de entregas não existe: ${pastaEntregas}`);
  }
  const template = carregarTemplate();
  const pastaTurma = path.join(destino, turma);
  fs.mkdirSync(pastaTurma, { recursive: true });

  const itens = fs.readdirSync(pastaEntregas, { withFileTypes: true });
  const relatorio = { preparados: [], pulados: [], ignorados: [], erros: [] };

  for (const item of itens) {
    const origem = path.join(pastaEntregas, item.name);
    try {
      if (item.isFile() && item.name.toLowerCase().endsWith(".zip")) {
        processar(origem, item.name.slice(0, -4), pastaTurma, template, relatorio, "zip");
      } else if (item.isDirectory()) {
        processar(origem, item.name, pastaTurma, template, relatorio, "pasta");
      } else {
        relatorio.ignorados.push(item.name);
      }
    } catch (e) {
      relatorio.erros.push({ item: item.name, erro: e.message });
    }
  }

  return relatorio;
}

function processar(origem, nomeBruto, pastaTurma, template, relatorio, tipo) {
  const nomeAluno = limparNome(nomeBruto);
  const pastaAluno = path.join(pastaTurma, normalizarPasta(nomeAluno));
  const pastaCodigo = path.join(pastaAluno, "codigo");

  if (fs.existsSync(path.join(pastaAluno, "gabarito.json"))) {
    relatorio.pulados.push(nomeAluno);
    return;
  }

  fs.mkdirSync(pastaCodigo, { recursive: true });

  let descartados = 0;
  if (tipo === "zip") descartados = extrairZip(origem, pastaCodigo);
  else copiarPasta(origem, pastaCodigo);

  achatarPastaUnica(pastaCodigo);

  fs.writeFileSync(
    path.join(pastaAluno, "aluno.json"),
    JSON.stringify({ nome: nomeAluno, turma: path.basename(pastaTurma) }, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(pastaAluno, "gabarito.json"),
    JSON.stringify(template, null, 2),
    "utf-8"
  );

  const arquivos = contarArquivos(pastaCodigo);
  relatorio.preparados.push({ nome: nomeAluno, arquivos, descartados });
  if (arquivos === 0) {
    relatorio.erros.push({ item: nomeAluno, erro: "entrega vazia (0 arquivos extraídos)" });
  }
}

/* ── Template ───────────────────────────────────────────────────── */

function carregarTemplate() {
  const caminho = path.join(process.cwd(), "template_gabarito.json");
  if (!fs.existsSync(caminho)) {
    throw new Error(
      "template_gabarito.json não encontrado na raiz do projeto — " +
        "ele é a base do gabarito de cada aluno."
    );
  }
  const t = JSON.parse(fs.readFileSync(caminho, "utf-8"));
  zerar(t); // garantia extra: nunca herdar SIMs pré-preenchidos
  return t;
}

function zerar(no) {
  if (Array.isArray(no)) return no.forEach(zerar);
  if (no && typeof no === "object") {
    const chaves = Object.keys(no).map((k) => k.toUpperCase());
    if (chaves.includes("SIM") && chaves.includes("NAO")) {
      for (const k of Object.keys(no)) {
        if (k.toUpperCase() === "SIM") no[k] = false;
        else if (k.toUpperCase() === "NAO") no[k] = true;
        else if (k === "Justificativa_do_Nao") no[k] = "";
      }
    } else {
      Object.values(no).forEach(zerar);
    }
  }
}

/* ── Extração ───────────────────────────────────────────────────── */

const IGNORAR = new Set([...CONFIG.pastasIgnoradas, "__MACOSX", ".DS_Store"]);

function deveIgnorar(caminhoRelativo) {
  return caminhoRelativo
    .split(/[\\/]/)
    .some((parte) => IGNORAR.has(parte));
}

function extrairZip(arquivoZip, destino) {
  const mb = fs.statSync(arquivoZip).size / 1048576;
  if (mb > 300) {
    console.warn(
      `   ⚠️  ${path.basename(arquivoZip)} tem ${mb.toFixed(0)} MB — ` +
        `extração pode demorar/consumir memória (node_modules será descartado mesmo assim).`
    );
  }
  const zip = new AdmZip(arquivoZip);
  let ignorados = 0;
  for (const entrada of zip.getEntries()) {
    if (entrada.isDirectory) continue;
    if (deveIgnorar(entrada.entryName)) { ignorados++; continue; }
    // proteção contra zip-slip (../../fora-da-pasta) — sempre em caminhos resolvidos
    const base = path.resolve(destino);
    const alvo = path.resolve(base, entrada.entryName);
    if (!alvo.startsWith(base + path.sep)) continue;
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, entrada.getData());
  }
  return ignorados;
}

function copiarPasta(origem, destino) {
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    if (IGNORAR.has(item.name)) continue;
    const de = path.join(origem, item.name);
    const para = path.join(destino, item.name);
    if (item.isDirectory()) {
      fs.mkdirSync(para, { recursive: true });
      copiarPasta(de, para);
    } else {
      fs.copyFileSync(de, para);
    }
  }
}

/** Se o zip continha uma única pasta raiz, sobe o conteúdo um nível */
function achatarPastaUnica(pastaCodigo) {
  for (let i = 0; i < 3; i++) {
    const itens = fs.readdirSync(pastaCodigo, { withFileTypes: true });
    if (itens.length !== 1 || !itens[0].isDirectory()) return;
    const unica = path.join(pastaCodigo, itens[0].name);
    for (const filho of fs.readdirSync(unica)) {
      fs.renameSync(path.join(unica, filho), path.join(pastaCodigo, filho));
    }
    fs.rmdirSync(unica);
  }
}

/* ── Nomes ──────────────────────────────────────────────────────── */

function limparNome(bruto) {
  return bruto
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((palavra) =>
      palavra.length > 0
        ? palavra[0].toUpperCase() + palavra.slice(1)
        : palavra
    )
    .join(" ");
}

function normalizarPasta(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function contarArquivos(dir) {
  let n = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) n += contarArquivos(path.join(dir, item.name));
    else n++;
  }
  return n;
}
