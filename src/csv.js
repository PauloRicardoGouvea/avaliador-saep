import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

/**
 * Gera um CSV consolidado (uma linha por aluno) para abrir no Excel.
 * Colunas: aluno, turma, %, nível de cada atividade, itens p/ revisão e bugs.
 * Usa ";" como separador e BOM UTF-8 — o Excel em pt-BR abre direto.
 */
export function gerarCSV(resultados, destino) {
  const ids = Object.keys(CONFIG.nomesAtividades);

  const cabecalho = [
    "Aluno",
    "Turma",
    "Percentual",
    ...ids.map((id) => `${id} (teto ${CONFIG.nivelMaximo[id]})`),
    "Nao entregues",
    "Itens p/ revisao",
    "Bugs de execucao",
  ];

  const linhas = resultados.map((r) => {
    const v = r.vereditos;
    const bugs = ids
      .flatMap((id) => (v[id]?.bugs || []).map((b) => `${id}: ${b}`))
      .join(" | ");
    const revisar = ids.filter((id) => v[id]?.revisar).join(", ");

    return [
      r.aluno.nome,
      r.aluno.turma,
      `${r.parecer.totais.percentual}%`,
      ...ids.map((id) => (v[id]?.nivel === null || v[id] === undefined ? "-" : v[id].nivel)),
      r.parecer.totais.tempo,
      revisar,
      bugs,
    ];
  });

  linhas.sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR"));

  const conteudo =
    "\uFEFF" +
    [cabecalho, ...linhas]
      .map((linha) => linha.map(escapar).join(";"))
      .join("\r\n");

  const arquivo = path.join(destino, "resultados.csv");
  fs.writeFileSync(arquivo, conteudo, "utf-8");
  return arquivo;
}

function escapar(valor) {
  const s = String(valor ?? "");
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
