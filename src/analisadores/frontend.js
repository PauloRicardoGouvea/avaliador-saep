/** Verifica presença de artefatos de frontend por atividade */
export function analisarFrontend(arquivosFrontend) {
  const conteudoTotal = arquivosFrontend.map((a) => a.conteudo).join("\n");

  return {
    existe: arquivosFrontend.length > 0,
    temForm: /<form|useForm|onSubmit/i.test(conteudoTotal),
    temFetch: /fetch\s*\(|axios|XMLHttpRequest/i.test(conteudoTotal),
    temTabela: /<table|\.map\s*\(|v-for|ngFor/i.test(conteudoTotal),
    testar: (regex) => regex.test(conteudoTotal),
  };
}