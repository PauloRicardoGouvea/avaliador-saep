import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

/**
 * Varre recursivamente a pasta do aluno e retorna todos os arquivos
 * de código com seu conteúdo carregado em memória.
 */
export function varrerProjeto(dirRaiz) {
  const arquivos = [];

  function varrer(dir) {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entrada of entradas) {
      const caminho = path.join(dir, entrada.name);

      if (entrada.isDirectory()) {
        if (!CONFIG.pastasIgnoradas.includes(entrada.name)) varrer(caminho);
        continue;
      }

      const ext = path.extname(entrada.name).toLowerCase();
      if (!CONFIG.extensoesCodigo.includes(ext)) continue;

      let conteudo = "";
      try {
        conteudo = fs.readFileSync(caminho, "utf-8");
      } catch {
        continue;
      }

      arquivos.push({
        caminho,
        nome: entrada.name,
        ext,
        conteudo,
        relativo: path.relative(dirRaiz, caminho),
      });
    }
  }

  varrer(dirRaiz);
  return arquivos;
}

/** Filtra arquivos por categoria heurística */
export function categorizar(arquivos) {
  return {
    sql: arquivos.filter((a) => a.ext === ".sql"),
    backend: arquivos.filter(
      (a) =>
        [".js", ".ts", ".mjs", ".cjs", ".php", ".py"].includes(a.ext) &&
        !/frontend|public|client|views?\/|src\/pages/i.test(a.relativo) &&
        /express|require|import|app\.|router\.|Route::|@app\.route/i.test(
          a.conteudo
        )
    ),
    frontend: arquivos.filter(
      (a) =>
        [".html", ".jsx", ".tsx", ".css"].includes(a.ext) ||
        /frontend|public|client|pages/i.test(a.relativo)
    ),
    todos: arquivos,
  };
}