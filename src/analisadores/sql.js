/**
 * Analisa scripts SQL (e SQL embutido no backend) de forma ESTRUTURADA:
 *  - tabelas: nome, corpo, colunas, PK, FK, nº de registros inseridos
 *  - views: nome, corpo do SELECT, nº de colunas, presença de cálculo qtd*valor
 *
 * Importante: SQL embutido em strings do backend conta como artefato
 * (aluno que criou a view via código, ou que faz consultas nas rotas).
 */
export function analisarSQL(arquivosSQL, arquivosBackend) {
  const sqlPuro = arquivosSQL.map((a) => a.conteudo).join("\n");
  const sqlEmbutido = extrairStringsSQL(
    arquivosBackend.map((a) => a.conteudo).join("\n")
  );
  const total = limparComentarios(sqlPuro + "\n" + sqlEmbutido);

  const tabelas = extrairTabelas(total);
  const views = extrairViews(total);
  contarInserts(total, tabelas);

  return {
    tabelas,
    views,
    qtdTabelas: tabelas.length,
    nomesTabelas: tabelas.map((t) => t.nome),
    nomesViews: views.map((v) => v.nome),
    temCreateTable: tabelas.length > 0,
    temView: views.length > 0,
    temInsert: /INSERT\s+INTO/i.test(total),
    temPK: tabelas.some((t) => t.temPK),
    temFK: tabelas.some((t) => t.temFK),
    todasTemPK: tabelas.length > 0 && tabelas.every((t) => t.temPK),
    algumaFK: tabelas.some((t) => t.temFK),
    todasTem3Registros:
      tabelas.length > 0 && tabelas.every((t) => t.registros >= 3),
    viewEstoque: views.find((v) => /vw[_-]?estoque/i.test(v.nome)) || views[0] || null,
    conteudo: total,
    testar: (re) => re.test(total),
  };
}

function limparComentarios(sql) {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Pega strings de template/aspas no JS/PY que contenham comandos SQL */
function extrairStringsSQL(codigo) {
  const achados = [];
  const re = /([`'"])((?:\\.|(?!\1)[\s\S]){10,4000}?)\1/g;
  let m;
  while ((m = re.exec(codigo)) !== null) {
    if (/\b(CREATE|SELECT|INSERT|UPDATE|DELETE|ALTER)\b/i.test(m[2])) {
      achados.push(m[2]);
    }
  }
  return achados.join(";\n");
}

function extrairTabelas(sql) {
  const tabelas = [];
  // Cabeçalho apenas; o corpo é extraído balanceando parênteses,
  // pois alunos esquecem o ";" final e usam parênteses aninhados
  // (DECIMAL(10,2), REFERENCES produto(id)...).
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const corpo = corpoBalanceado(sql, m.index + m[0].length - 1);
    if (corpo === null) continue;
    tabelas.push({
      nome: m[1],
      corpo,
      colunas: extrairColunas(corpo),
      temPK: /PRIMARY\s+KEY|SERIAL|AUTO_INCREMENT|AUTOINCREMENT|IDENTITY/i.test(corpo),
      temAutoIncremento: /SERIAL|AUTO_INCREMENT|AUTOINCREMENT|IDENTITY|GENERATED\s+ALWAYS/i.test(corpo),
      temFK: /FOREIGN\s+KEY|REFERENCES\s+\w+/i.test(corpo),
      registros: 0,
    });
  }
  return tabelas;
}

function extrairColunas(corpoTabela) {
  return corpoTabela
    .split(/,(?![^()]*\))/) // vírgulas fora de parênteses
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^(PRIMARY|FOREIGN|CONSTRAINT|UNIQUE|CHECK|KEY|INDEX)\b/i.test(l)
    )
    .map((l) => l.split(/\s+/)[0].replace(/[`"']/g, ""));
}

function extrairViews(sql) {
  const views = [];
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+[`"']?(\w+)[`"']?\s+AS\s+SELECT\s+([\s\S]*?)\s+FROM\s+([\s\S]*?)(?:;|$)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const selectList = m[1] && m[2] ? m[2] : "";
    const colunas = selectList
      .split(/,(?![^()]*\))/)
      .map((c) => c.trim())
      .filter(Boolean);
    views.push({
      nome: m[1],
      selectList,
      corpo: m[0],
      qtdColunas: colunas.length,
      colunas,
      // cálculo do valor total = quantidade * valor unitário.
      // Um dos lados precisa parecer coluna de qtd/valor — evita que
      // "SELECT * FROM" seja confundido com multiplicação.
      temCalculo: RE_MULTIPLICACAO.test(selectList),
    });
  }
  return views;
}

/** multiplicação de domínio: qtd * valor (qualquer nomenclatura comum) */
export const RE_MULTIPLICACAO =
  /(qtd\w*|quant\w*|valor\w*|vl\w*|preco\w*|price\w*|unit\w*)\s*\*\s*\w+|\w+\s*\*\s*(qtd\w*|quant\w*|valor\w*|vl\w*|preco\w*|price\w*|unit\w*)/i;

/** devolve o conteúdo entre parênteses balanceados a partir do "(" em `abre` */
function corpoBalanceado(texto, abre) {
  let nivel = 0;
  for (let i = abre; i < Math.min(texto.length, abre + 6000); i++) {
    if (texto[i] === "(") nivel++;
    else if (texto[i] === ")") {
      nivel--;
      if (nivel === 0) return texto.slice(abre + 1, i);
    }
  }
  return null;
}

function contarInserts(sql, tabelas) {
  // O bloco VALUES termina em ";" OU no início da próxima instrução OU no fim
  // do arquivo. Alunos esquecem o ";" com frequência — antes isso fazia as
  // tuplas de uma tabela serem contadas na tabela anterior.
  const re =
    /INSERT\s+INTO\s+[`"']?(\w+)[`"']?[\s\S]*?VALUES\s*([\s\S]*?)(?=;|\bINSERT\s+INTO\b|\bCREATE\b|\bALTER\b|\bDROP\b|\bUPDATE\b|\bDELETE\b|$)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const tabela = tabelas.find(
      (t) => t.nome.toLowerCase() === m[1].toLowerCase()
    );
    if (!tabela) continue;
    const tuplas = m[2].match(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g);
    tabela.registros += tuplas ? tuplas.length : 1;
  }
}
