# Avaliador Automático SAEP

**Avaliador Automático SAEP** é uma ferramenta de correção automática para a prova prática SAEP — Técnico em Desenvolvimento de Sistemas (sistema de almoxarifado/estoque). Ele analisa Backend (Node/Fastify/Express/Flask), Banco de Dados (SQL) e Modelagem (DER), decide **o nível do gabarito (0 a 4) de cada uma das 11 atividades** e preenche o `gabarito_avaliado.json` com exatamente **um SIM por atividade**, justificando os NÃO.

### Como o nível é decidido (v2)
- Cada atividade (A01–A11) tem um avaliador próprio alinhado à prova real (view `vw_estoque`, saídas em ordem decrescente, relatório por período com 7 campos, limites 0/100 com percentual, etc.).
- **A04 tem teto no nível 3** — o próprio documento de correção não possui nível 4 (falha do gabarito oficial, documentada no feedback).
- Exigências que **não constam no enunciado** (formato de data `25-12-2025`, campos-fantasma como "unidade de medida" no produto, "responsável pela operação" no DER, duplicidade no cadastro) **não rebaixam a nota automaticamente**: geram marcação "⚠ revisar" no parecer para decisão humana.
- Ausência total de artefatos → marca `A0x_S6_0` (configurável em `src/config.js`, `decisaoAusencia`), sempre listado para confirmação humana — a ferramenta não tem como saber se foi desistência ou falta de tempo.
- Ao final roda uma checagem de sanidade: cada atividade precisa ter exatamente um SIM; violações são impressas no console e no parecer.

## 🌟 Recursos Principais

- **Interface Visual Moderna**: Envie arquivos através de uma interface web premium (*glassmorphism*) fácil de usar.
- **Interface de Linha de Comando (CLI)**: Processe avaliações em lote fornecendo um diretório inteiro de turmas e alunos.
- **Análise Inteligente**:
  - **Backend (.js)**: Extração e análise de rotas da API.
  - **Banco de Dados (.sql)**: Análise de tabelas, chaves primárias, estrangeiras e estrutura do banco.
  - **Modelagem (DER)**: Leitura de arquivos de imagem/PDF (Modelos Pé de Galinha, Chen, etc).
- **Relatórios Automatizados**: Gera `parecer.txt` com o feedback técnico e uma nota percentual detalhada.
- **Dashboard Consolidado**: Gera `dashboard.html` visual com o desempenho global de todos os alunos processados.

---

## 🚀 Instalação e Configuração

Certifique-se de ter o **Node.js** (versão 18 ou superior) instalado em sua máquina.

1. Baixe/Clone este repositório.
2. Abra o terminal na pasta do projeto e instale as dependências:
   ```bash
   npm install
   ```

---

## 💻 Como Usar (Interface Web) - Recomendado

A maneira mais fácil e interativa de corrigir o trabalho de um aluno individualmente.

1. Inicie o servidor:
   ```bash
   npm start
   ```
2. Abra seu navegador e acesse: **[http://localhost:3000](http://localhost:3000)**
3. **Preencha os dados:**
   - **Nome do Aluno** (Ex: João Silva)
   - **Turma** (Ex: 3B)
4. **Faça o upload dos arquivos:**
   - O arquivo do banco de dados (`.sql`).
   - O arquivo do servidor/backend (`.js`).
   - O modelo entidade-relacionamento (`.png`, `.jpg`, `.pdf`, `.drawio`, etc).
5. Clique em **"Avaliar Projeto"**. 
6. O sistema criará a estrutura de pastas automaticamente em `./provas/Turma/Aluno/codigo` e exibirá o percentual de acerto, tempo gasto e o parecer diretamente na tela!

---

## ⌨️ Como Usar (Linha de Comando - CLI)

Ideal para corrigir múltiplos alunos de uma vez (em lote).

1. Estruture a pasta `./provas` seguindo o modelo:
   ```text
   provas/
   └── 3B/                 # Turma
       └── joao_silva/     # Nome do Aluno
           ├── gabarito.json
           └── codigo/     # Onde ficam os arquivos (.sql, .js, DER) do aluno
   ```

2. Para avaliar **todas as turmas** de uma vez:
   ```bash
   node index.js ./provas
   ```

3. Para avaliar apenas **um aluno específico**:
   ```bash
   node index.js ./provas/3B/joao_silva
   ```

No final da execução, um arquivo `parecer.txt` será criado dentro da pasta de cada aluno, e um `dashboard.html` será gerado na raiz da avaliação.

---

## 🤖 Correção com IA (Groq) — recomendado para lote

Sem chave, a ferramenta funciona só com análise estática (regex/AST): ela vê *estrutura*, mas não sabe se o código **rodaria**. Com a IA ligada, cada atividade é julgada contra o **texto oficial dos descritores 0–4** e bugs de execução (SQL inválido, tabela inexistente, coluna errada) são detectados e listados no parecer.

### 1. Pegue uma chave (gratuita)
https://console.groq.com/keys → crie a chave (começa com `gsk_`).

### 2. Configure

**Linux/macOS:**
```bash
export GROQ_API_KEY="gsk_sua_chave_aqui"
```

**Windows (PowerShell):**
```powershell
$env:GROQ_API_KEY="gsk_sua_chave_aqui"
```

**Windows (CMD):**
```cmd
set GROQ_API_KEY=gsk_sua_chave_aqui
```

Para não repetir a cada sessão, copie `.env.example` para `.env` e rode com `node --env-file=.env index.js ./provas` (Node 20+).

### 3. Rode em lote
```bash
node index.js ./provas                 # todas as turmas
node index.js ./provas --alunos=5      # 5 alunos em paralelo
node index.js ./provas --refazer       # reavalia quem já tem nota
node index.js ./provas --llm=off       # só análise estática
```

Saídas: `gabarito_avaliado.json` + `parecer.txt` por aluno, `dashboard.html` e **`resultados.csv`** (abre direto no Excel, uma linha por aluno com o nível de cada atividade, bugs e itens a revisar).

### Modos da IA
| Modo | O que faz |
|---|---|
| `--llm=auto` (padrão) | IA avalia **todas** as atividades entregues, usando os descritores oficiais |
| `--llm=fallback` | IA só decide os casos que a análise estática marcou como duvidosos (mais barato) |
| `--llm=off` | Sem IA |

### Cache e rate limit
- Respostas ficam em `.cache-llm/`: reavaliar o mesmo aluno **não gasta chamada nova**. Use `--limpar-cache` para forçar.
- O free tier do Groq limita requisições por minuto. O padrão `LLM_CONCORRENCIA=2` respeita isso, e há retry automático com backoff em caso de 429. Se tiver plano pago, suba para 5–10.
- Modelo aposentado? Troque via `LLM_MODEL` sem tocar no código. Lista atual: https://console.groq.com/docs/models

### Análise do DER por imagem
Se o aluno entregar o DER como `.png`/`.jpg`, a IA de visão lê o diagrama e atribui o nível. Arquivos `.drawio`/`.svg` são lidos como XML mesmo sem IA.

### Modo autônomo (`--auto`) — sem revisão humana

```bash
node index.js ./provas --auto --alunos=5
```

Com `--auto`, a ferramenta decide tudo sozinha e o `parecer.txt` não pede nada:
- Ausência de código aplica a convenção de `CONFIG.decisaoAusencia` (padrão `S6`) sem perguntar;
- A IA é obrigada a escolher um nível — o que seria "revisar" vira **📝 OBSERVAÇÕES (nota já atribuída)**;
- Bugs de execução continuam sendo listados (são fatos, não dúvidas).

Exige a IA ligada (`GROQ_API_KEY`), porque é ela quem decide os casos duvidosos.

> **Importante:** o `gabarito_avaliado.json` é idêntico nos dois modos e **sempre sai completo**, com exatamente 1 SIM por atividade. O ⚠ do modo normal nunca bloqueou nada — é só um aviso no parecer. `--auto` apenas silencia esses avisos.

> ⚠️ **O que a ferramenta não tem como saber:** se o aluno desistiu (S6) ou ficou sem tempo (S7). O `--auto` aplica a convenção configurada para todos. Se quiser S7, use `SAEP_AUSENCIA=S7`.

---

## 🛠️ Tecnologias Utilizadas

- **Node.js** (Ambiente de Execução e lógica Core)
- **Express** (Servidor da Interface Web)
- **Multer** (Gerenciamento de Uploads)
- **Vanilla HTML/CSS/JS** (Frontend Moderno, leve e rápido)

---

## 📝 Licença
Desenvolvido para automatizar e facilitar as correções técnicas. Sinta-se à vontade para clonar e modificar de acordo com as necessidades e regras de negócio da sua instituição.
