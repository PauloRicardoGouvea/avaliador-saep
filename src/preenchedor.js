import { CONFIG } from "./config.js";

/**
 * Preenche o gabarito SAEP a partir dos níveis decididos pelo motor.
 *
 * Correções críticas em relação à versão anterior:
 *  1. RESET primeiro: TODOS os critérios da atividade viram NAO antes de
 *     marcar o escolhido — gabaritos pré-preenchidos (vindos de planilha)
 *     não "vazam" mais para o resultado final.
 *  2. Identificação por SUFIXO DE NÍVEL (_00.._04), e não pelo regex /_4$/
 *     que nunca casava com chaves como "##A02_04".
 *  3. Chaves com "##" (marcador visual de critério-teto) são tratadas.
 *  4. Sanidade: ao final, cada atividade deve ter EXATAMENTE UM SIM;
 *     violações são retornadas em `problemas` e impressas no console.
 */
export function preencherGabarito(gabarito, resultados) {
  const clone = structuredClone(gabarito);
  const criterios = coletarCriterios(clone);
  const problemas = [];

  const porAtividade = {};
  for (const c of criterios) {
    const m = c.id.match(/^(?:##)?(A\d{2})/);
    if (m) (porAtividade[m[1]] ||= []).push(c);
  }

  for (const [atividade, lista] of Object.entries(porAtividade)) {
    const r = resultados[atividade];
    if (!r) {
      problemas.push(`${atividade}: sem avaliador definido — critérios não alterados.`);
      continue;
    }
    aplicarNivel(atividade, lista, r, problemas);
  }

  // ── Sanidade: exatamente um SIM por atividade ──
  for (const [atividade, lista] of Object.entries(porAtividade)) {
    const sims = lista.filter((c) => valorSim(c.ref));
    if (sims.length !== 1) {
      problemas.push(
        `${atividade}: ${sims.length} critério(s) marcados SIM (esperado: exatamente 1).`
      );
    }
  }

  return { gabarito: clone, problemas };
}

function aplicarNivel(atividade, criterios, r, problemas) {
  // 1) Reset geral
  for (const c of criterios) {
    setResposta(c.ref, false);
    setJustificativa(c.ref, "");
  }

  const ehS6 = (c) => /_S6_/i.test(c.id);
  const ehS7 = (c) => /_S7_/i.test(c.id);
  const doNivel = (c, n) =>
    new RegExp(`_0?${n}(?:_|$)`).test(c.id.replace(/^##/, "").replace(/^A\d{2}/, ""));

  // 2) Ausência total → S6/S7/revisão conforme configuração
  if (r.nivel === null) {
    const alvoAusencia =
      CONFIG.decisaoAusencia === "S7"
        ? criterios.find(ehS7) || criterios.find(ehS6)
        : CONFIG.decisaoAusencia === "S6"
          ? criterios.find(ehS6) || criterios.find(ehS7)
          : null;

    for (const c of criterios) {
      if (c === alvoAusencia) continue;
      if (!ehS6(c) && !ehS7(c)) {
        setResposta(c.ref, false);
        setJustificativa(c.ref, "Ausência total de código para este requisito.");
      }
    }
    if (alvoAusencia) {
      setResposta(alvoAusencia.ref, true);
      setJustificativa(alvoAusencia.ref, "");
      r.evidencias.push(
        CONFIG.modoAutonomo
          ? `Ausência total → marcado ${alvoAusencia.id} (convenção definida em CONFIG.decisaoAusencia).`
          : `Ausência total → marcado ${alvoAusencia.id} (confirmar com o aluno se foi desistência ou falta de tempo).`
      );
      if (!CONFIG.modoAutonomo) r.revisar = true;
    } else {
      problemas.push(`${atividade}: ausência total e nenhum critério S6/S7 no gabarito — nada marcado.`);
      r.revisar = true;
    }
    return;
  }

  // 3) Localiza o critério do nível decidido (degrada se o nível não existir no JSON)
  let alvo = null;
  for (let n = r.nivel; n >= 0 && !alvo; n--) {
    alvo = criterios.find((c) => !ehS6(c) && !ehS7(c) && doNivel(c, n));
    if (alvo && n < r.nivel) {
      r.evidencias.push(
        `Nível ${r.nivel} não existe no JSON do gabarito — aplicado nível ${n} (mais próximo disponível).`
      );
      r.revisar = true;
    }
  }
  if (!alvo) {
    problemas.push(`${atividade}: nenhum critério de nível localizado no gabarito.`);
    r.revisar = true;
    return;
  }

  // 4) Marca o alvo e justifica os demais
  const nomeAlvo = alvo.id;
  for (const c of criterios) {
    if (c === alvo) {
      setResposta(c.ref, true);
      setJustificativa(c.ref, "");
    } else if (ehS6(c) || ehS7(c)) {
      setResposta(c.ref, false);
      setJustificativa(c.ref, "O aluno realizou a atividade normalmente.");
    } else {
      setResposta(c.ref, false);
      setJustificativa(
        c.ref,
        `Nível atingido pelo aluno: ${nomeAlvo}. Este critério não corresponde ao desempenho verificado.`
      );
    }
  }
}

/* ── Travessia genérica do JSON ─────────────────────────────────── */

const RE_ID_CRITERIO = /^(?:##)?A\d{2}[_A-Za-z0-9+.\-]*$/;

function coletarCriterios(no, acumulador = []) {
  if (Array.isArray(no)) {
    for (const item of no) coletarCriterios(item, acumulador);
  } else if (no && typeof no === "object") {
    const id = encontrarIdInterno(no);
    if (id && temCamposResposta(no)) acumulador.push({ id, ref: no });

    for (const [chave, valor] of Object.entries(no)) {
      if (
        RE_ID_CRITERIO.test(chave) &&
        valor && typeof valor === "object" &&
        temCamposResposta(valor) &&
        !acumulador.some((a) => a.ref === valor)
      ) {
        acumulador.push({ id: chave, ref: valor });
      }
      coletarCriterios(valor, acumulador);
    }
  }
  return acumulador;
}

function encontrarIdInterno(obj) {
  for (const chave of ["id", "criterio_id", "codigo", "ID"]) {
    if (typeof obj[chave] === "string" && RE_ID_CRITERIO.test(obj[chave])) return obj[chave];
  }
  return null;
}

function temCamposResposta(obj) {
  const chaves = Object.keys(obj).map((k) => k.toUpperCase());
  return chaves.includes("SIM") && chaves.includes("NAO");
}

const chaveReal = (obj, alvo) =>
  Object.keys(obj).find((k) => k.toUpperCase() === alvo.toUpperCase());

function setResposta(obj, sim) {
  const kSim = chaveReal(obj, "SIM");
  const kNao = chaveReal(obj, "NAO");
  if (kSim) obj[kSim] = sim;
  if (kNao) obj[kNao] = !sim;
}

const valorSim = (obj) => {
  const k = chaveReal(obj, "SIM");
  return k ? obj[k] === true : false;
};

function setJustificativa(obj, texto) {
  const k = chaveReal(obj, "Justificativa_do_Nao");
  if (k) obj[k] = texto;
}
