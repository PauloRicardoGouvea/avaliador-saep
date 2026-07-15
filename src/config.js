/**
 * Configuração central do avaliador — ALINHADA À PROVA REAL:
 * "Técnico em Desenvolvimento de Sistemas — Prova Função 01"
 * (Sistema de controle de almoxarifado / estoque)
 */

export const CONFIG = {
  extensoesCodigo: [
    ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
    ".sql", ".html", ".css", ".php", ".py", ".json",
  ],

  pastasIgnoradas: ["node_modules", ".git", "dist", "build", ".next"],

  /** Ausência total de artefatos: "S6" | "S7" | "revisao" */
  decisaoAusencia: process.env.SAEP_AUSENCIA || "S6",

  /**
   * MODO AUTÔNOMO (--auto): a ferramenta decide tudo sozinha e não pede
   * revisão humana. O gabarito_avaliado.json sai igual nos dois modos —
   * o que muda é só a lista de avisos do parecer.txt.
   *
   * Ficam de fora do silêncio (sempre aparecem, porque são fatos e não
   * dúvidas): bugs de execução encontrados pela IA.
   */
  modoAutonomo: process.env.SAEP_AUTO === "1",

  /** Teto de nível por atividade (A04 trava no 3 por erro do próprio gabarito) */
  nivelMaximo: {
    A01: 4, A02: 4, A03: 4, A04: 3, A05: 4, A06: 4,
    A07: 4, A08: 4, A09: 4, A10: 4, A11: 4,
  },

  nomesAtividades: {
    A01: "Script / população do banco de dados",
    A02: "View vw_estoque",
    A03: "Diagrama Entidade-Relacionamento (DER)",
    A04: "Listagem de valor total via view",
    A05: "Listagem de todos os produtos",
    A06: "Cadastro de novo produto",
    A07: "Listagem de saídas (ordem decrescente por data)",
    A08: "Entrada de itens no estoque",
    A09: "Relatório de entradas/saídas por período",
    A10: "Produtos com maior volume de saída",
    A11: "Produtos nos limites mín/máx de estoque",
  },

  /* ── LLM (Groq por padrão — API compatível com OpenAI) ───────────── */
  llm: {
    /**
     * modo:
     *  "auto"     → LLM revisa TODAS as atividades que têm código (recomendado)
     *  "fallback" → LLM só resolve as atividades de baixa confiança
     *  "off"      → sem LLM, só análise estática
     * CLI: --llm=auto|fallback|off   |   env: SAEP_LLM
     */
    modo: process.env.SAEP_LLM || "auto",

    baseURL: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY || process.env.LLM_API_KEY || "",

    // Modelos configuráveis: se o Groq aposentar um modelo, troque por env
    // (LLM_MODEL / LLM_VISION_MODEL) sem mexer no código.
    modelo: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
    modeloVisao: process.env.LLM_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",

    // Free tier do Groq limita req/min — 2 é seguro. Suba se tiver plano pago.
    concorrencia: Number(process.env.LLM_CONCORRENCIA || 2),
    tentativas: 4,
    timeoutMs: 60000,
    maxCaracteresCodigo: 24000,

    // Cache em disco: mesma atividade + mesmo código = não gasta chamada de novo
    cache: process.env.LLM_CACHE !== "off",
    pastaCache: ".cache-llm",
  },

  /**
   * DESCRITORES OFICIAIS do gabarito SAEP (texto dos critérios).
   * Enviados à LLM para que ela decida o nível conforme o documento oficial,
   * e não conforme "achismo" de qualidade de código.
   */
  descritores: {
    A01: {
      0: "O script criado apresenta código que inviabiliza a compilação da linguagem.",
      1: "O script do banco de dados foi compilado, porém apresenta erros estruturais, como inconsistências em tipos de dados, chaves primárias ou estrangeiras, que inviabilizam o funcionamento do banco e o atendimento a todas as regras de negócio.",
      2: "O script foi implementado de acordo com as regras de negócio, respeitando os tipos de dados, porém sem implementar as chaves primárias e estrangeiras conforme boas práticas.",
      3: "O script foi implementado de acordo com as regras de negócio, respeitando os tipos de dados, chaves primárias e estrangeiras, porém sem a inserção dos três registros mínimos.",
      4: "O script foi implementado de acordo com as regras de negócio, contendo todas as tabelas com, no mínimo, três registros cada, respeitando os tipos de dados, chaves primárias e estrangeiras.",
    },
    A02: {
      0: "A view vw_estoque não apresenta qualquer estrutura que permita a apuração do valor total por produto.",
      1: "A view vw_estoque foi implementada apresentando erros de cálculo que inviabilizam a apuração do valor total por produto.",
      2: "A view calcula o valor total por item (quantidade x valor unitário) e/ou retorna tabela com apenas duas colunas: valor total obrigatório; opcionais: identificador, valor unitário, quantidade e denominação.",
      3: "A view calcula o valor total por item e retorna 3 ou 4 colunas: valor total, valor unitário e denominação (nome) obrigatórios; quantidade opcional.",
      4: "A view calcula o valor total por item e retorna no mínimo 5 colunas: identificador, valor unitário, valor total, quantidade e denominação (nome).",
    },
    A03: {
      0: "A modelagem apresenta registros de classes e atributos incompatíveis com os requisitos funcionais e a regra de negócio.",
      1: "O DER contempla 1 elemento obrigatório dentre: entidades, atributos, identificador com auto-incremento, chaves primárias, chaves estrangeiras e cardinalidade dos relacionamentos.",
      2: "O DER contempla, no mínimo, 2 dos 6 elementos obrigatórios.",
      3: "O DER contempla, no mínimo, 4 dos 6 elementos obrigatórios, com representação da estrutura principal dos dados do sistema.",
      4: "O DER contempla os 6 elementos obrigatórios: entidades, atributos, identificador com auto-incremento, chaves primárias, chaves estrangeiras e cardinalidade dos relacionamentos, incluindo registro de movimentações.",
    },
    A04: {
      0: "A entrega não configura funcionalidade.",
      1: "Implementação com erros de lógica e estrutura que impedem a execução do cálculo e da listagem do valor total.",
      2: "Função que calcula o valor total por item usando SQL/lógica direto no código, SEM uso da view, ou usa a view retornando resultado errado.",
      3: "Função que lista o valor total por item de produto utilizando consulta à view. (TETO DESTA ATIVIDADE — o gabarito não possui nível 4.)",
    },
    A05: {
      0: "A entrega não configura funcionalidade.",
      1: "Tentativa de implementação com erros de lógica e estrutura que impedem a execução da operação.",
      2: "Lista todos os produtos com no mínimo 3 campos principais (nome, quantidade em estoque e valor unitário), porém com falhas de validação, tratamento de erros ou padronização.",
      3: "Lista todos os produtos de forma funcional com no mínimo 4 campos (nome, unidade de medida, quantidade e valor unitário), porém com falhas de validação, tratamento de erros ou padronização.",
      4: "Lista todos os produtos com os 6 campos previstos e validações (nome, unidade de medida, quantidade, valor unitário, limite máximo e mínimo), integração com o banco e código padronizado.",
    },
    A06: {
      0: "A entrega não configura funcionalidade.",
      1: "Implementação da função de cadastro com falhas de lógica/estrutura que impedem a inserção do produto no banco.",
      2: "Cadastro implementado conforme regras de negócio, porém sem os critérios de validação (valor unitário, quantidade, denominação, duplicidade) e/ou sem tratamento de erros.",
      3: "Cadastro implementado com as validações (valor unitário, quantidade e denominação), porém sem tratamento de erros.",
      4: "Cadastro implementado com as validações, verificação contra duplicidade e tratamento de erros.",
    },
    A07: {
      0: "A entrega não configura funcionalidade.",
      1: "Função de listagem de saídas com falhas que inviabilizam o retorno dos registros em ordem decrescente por data.",
      2: "Retorna as saídas com no mínimo 2 dos 6 campos, porém não está em ordem decrescente por data e/ou a data não segue o formato 25-12-2025.",
      3: "Retorna as saídas em ordem decrescente por data com no mínimo 4 campos, porém a data não segue o formato 25-12-2025.",
      4: "Retorna todas as saídas em ordem decrescente por data, com os 6 campos e data no formato 25-12-2025.",
    },
    A08: {
      0: "A entrega não configura funcionalidade.",
      1: "Função de entrada com erros de lógica/estrutura que impedem o registro da entrada.",
      2: "Registra a entrada e atualiza o saldo, porém com erro na fórmula do cálculo; integra com o banco, mas a data não está no formato 25-12-2025.",
      3: "Registra a entrada e atualiza automaticamente as quantidades com base no saldo atual, integrando com o banco, porém a data não está no formato 25-12-2025.",
      4: "Registra a entrada, atualiza as quantidades conforme o saldo atual, emite a data no formato 25-12-2025 e integra com o banco.",
    },
    A09: {
      0: "A entrega não configura funcionalidade.",
      1: "Relatório por período com erros de lógica que impedem o retorno dos dados no intervalo e/ou erro na fórmula do valor financeiro.",
      2: "Emite o relatório no período com cálculos precisos, contendo até 3 campos obrigatórios na sequência: nome do produto, unidade de medida e total de entradas.",
      3: "Emite o relatório no período com cálculos precisos, contendo de 4 a 6 campos obrigatórios na sequência: nome, unidade de medida, total de entradas, total de saídas, saldo no período e valor total financeiro das entradas.",
      4: "Emite o relatório no período contendo os 7 campos: nome, unidade de medida, total de entradas, total de saídas, saldo no período, valor total financeiro das entradas e valor total financeiro das saídas.",
    },
    A10: {
      0: "A entrega não configura funcionalidade.",
      1: "Função com erros de lógica que impedem o retorno dos produtos, das quantidades no intervalo informado e/ou a ordenação.",
      2: "Retorna os produtos com maior saída no período, com agrupamento por produto e ordenação decrescente, com 1 dos 3 campos obrigatórios calculado corretamente (nome, quantidade total de saída, valor total financeiro das saídas).",
      3: "Idem ao nível 2, porém com 2 dos 3 campos obrigatórios calculados corretamente.",
      4: "Retorna os produtos com maior saída no período, agrupados por produto e ordenados de forma decrescente pela quantidade total, com os 3 campos obrigatórios calculados corretamente e na sequência: nome do produto, quantidade total de saída e valor total financeiro das saídas.",
    },
    A11: {
      0: "A entrega não configura funcionalidade.",
      1: "Função de verificação de níveis com erros de lógica que impedem a identificação de produtos nos níveis mínimo ou máximo.",
      2: "Retorna produtos com 3 campos de referência: nome do produto, limite mínimo e limite máximo de estoque.",
      3: "Retorna produtos com 4 campos de referência: nome, quantidade em estoque, limite mínimo e limite máximo.",
      4: "Retorna produtos com os 4 campos de referência (nome, quantidade em estoque, limite mínimo e limite máximo) e a identificação do percentual de nível atingido.",
    },
  },

  /**
   * PONTOS DE ATENÇÃO (documento de feedback): exigências que estão no
   * gabarito mas NÃO no enunciado da prova. A LLM é instruída a não rebaixar
   * o aluno por elas sem sinalizar para revisão humana.
   */
  requisitosFantasma: {
    A02: "A prova não pede as 5 colunas específicas — só 'valor total por item de produto'.",
    A03: "A prova NÃO menciona 'responsável pela operação'/usuários. Não exija tabela de responsável.",
    A05: "A prova define o produto com 4 campos (nome, categoria, quantidade, valor unitário). 'Unidade de medida' e 'limites mín/máx' NÃO são campos do cadastro no enunciado.",
    A06: "A prova pede validar valor unitário, quantidade e CATEGORIA (o gabarito troca categoria por 'denominação'). 'Duplicidade' não consta no enunciado.",
    A07: "O formato de data 25-12-2025 e os '6 campos' NÃO constam na regra de negócio — é listagem de saídas.",
    A08: "O formato de data 25-12-2025 NÃO consta na regra de negócio.",
    A11: "Os 4 campos de retorno não constam no enunciado — a prova pede identificar produtos nos limites e o percentual.",
  },
};
