/**
 * Analisa o código backend do aluno.
 *
 * Correções em relação à versão anterior:
 *  1. Rotas: aceita QUALQUER nome de instância (servidor.get, meuApp.post,
 *     rota.put...), não só app|router|server|api. O aluno brasileiro nomeia
 *     em português o tempo todo.
 *  2. A prova aceita entrega via "retorno/saída de função exibida no
 *     console" — então também extraímos FUNÇÕES nomeadas, não só rotas.
 *  3. Cada rota/função carrega o próprio CORPO, permitindo inspecionar o
 *     SQL e a lógica interna (ordenação, cálculo, validação, try/catch...).
 */

export function analisarBackend(arquivosBackend) {
  const blocos = [];

  for (const arq of arquivosBackend) {
    const codigo = removerComentarios(arq.conteudo);
    blocos.push(...extrairRotas(codigo, arq.relativo));
    blocos.push(...extrairFuncoes(codigo, arq.relativo));
  }

  const codigoTotal = arquivosBackend
    .map((a) => removerComentarios(a.conteudo))
    .join("\n");

  return {
    blocos,
    rotas: blocos.filter((b) => b.tipo === "rota"),
    funcoes: blocos.filter((b) => b.tipo === "funcao"),
    codigoTotal,
    existe: arquivosBackend.length > 0,
    testar: (re) => re.test(codigoTotal),

    /**
     * Localiza o bloco (rota OU função) mais provável de implementar uma
     * funcionalidade, dado um conjunto de pistas (regex sobre nome/path/corpo).
     * Retorna { bloco, pontos } ou null.
     */
    localizar(pistas) {
      let melhor = null;
      for (const b of blocos) {
        let pontos = 0;
        const alvoNome = `${b.metodo || ""} ${b.path || ""} ${b.nome || ""}`;
        for (const p of pistas.nome || []) if (p.test(alvoNome)) pontos += 3;
        for (const p of pistas.corpo || []) if (p.test(b.corpo)) pontos += 2;
        if (pistas.metodo && b.metodo && pistas.metodo.test(b.metodo)) pontos += 2;
        if (pontos > 0 && (!melhor || pontos > melhor.pontos)) {
          melhor = { bloco: b, pontos };
        }
      }
      return melhor;
    },
  };
}

/* ── Rotas: <instancia>.<verbo>('path', handler) ───────────────── */

function extrairRotas(codigo, arquivo) {
  const rotas = [];

  // Express/Fastify/Koa-router com QUALQUER nome de instância
  const re =
    /\b(\w+)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*([`'"])([^`'"]+)\3/gi;
  let m;
  while ((m = re.exec(codigo)) !== null) {
    if (!m[4].startsWith("/")) continue; // descarta axios.get('http...') etc.
    rotas.push({
      tipo: "rota",
      instancia: m[1],
      metodo: m[2].toLowerCase(),
      path: m[4],
      corpo: capturarBloco(codigo, m.index),
      arquivo,
    });
  }

  // fastify.route({ method: 'GET', url: '/x' })
  const reObj =
    /method\s*:\s*[`'"](GET|POST|PUT|PATCH|DELETE)[`'"]\s*,\s*(?:url|path)\s*:\s*[`'"]([^`'"]+)[`'"]/gi;
  while ((m = reObj.exec(codigo)) !== null) {
    rotas.push({
      tipo: "rota", metodo: m[1].toLowerCase(), path: m[2],
      corpo: capturarBloco(codigo, m.index), arquivo,
    });
  }

  // Flask: @app.route('/x', methods=['POST'])
  const reFlask =
    /@\w+\.route\(\s*[`'"]([^`'"]+)[`'"]\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?/gi;
  while ((m = reFlask.exec(codigo)) !== null) {
    const metodos = (m[2] || "'GET'")
      .split(",").map((s) => s.replace(/['"\s]/g, "").toLowerCase());
    for (const metodo of metodos) {
      rotas.push({
        tipo: "rota", metodo, path: m[1],
        corpo: capturarBloco(codigo, m.index), arquivo,
      });
    }
  }

  return rotas;
}

/* ── Funções nomeadas: function listarSaidas() / const listar = () => ── */

function extrairFuncoes(codigo, arquivo) {
  const funcoes = [];
  const padroes = [
    /\b(?:async\s+)?function\s+(\w+)\s*\(/g,
    /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/g,
    /\bdef\s+(\w+)\s*\(/g, // python
  ];
  for (const re of padroes) {
    let m;
    while ((m = re.exec(codigo)) !== null) {
      funcoes.push({
        tipo: "funcao",
        nome: m[1],
        corpo: capturarBloco(codigo, m.index),
        arquivo,
      });
    }
  }
  return funcoes;
}

/**
 * Captura o bloco de código a partir de um índice, balanceando chaves.
 * Fallback: fatia de 1500 caracteres (suficiente p/ heurísticas).
 */
function capturarBloco(codigo, inicio) {
  const abre = codigo.indexOf("{", inicio);
  if (abre === -1 || abre - inicio > 300) return codigo.slice(inicio, inicio + 1500);
  let nivel = 0;
  for (let i = abre; i < Math.min(codigo.length, abre + 8000); i++) {
    if (codigo[i] === "{") nivel++;
    else if (codigo[i] === "}") {
      nivel--;
      if (nivel === 0) return codigo.slice(inicio, i + 1);
    }
  }
  return codigo.slice(inicio, inicio + 1500);
}

function removerComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*#(?!!).*$/gm, "");
}
