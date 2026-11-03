/**
 * Diz se o skill já foi configurado (perfil + estilo) ou se é o primeiro uso.
 * O SKILL.md roda isto no Passo 0; se "primeiroUso" for true, faz o onboarding.
 *
 * Saída: JSON em uma linha. Código de saída: 0 = pronto, 2 = falta configurar.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { executadoDiretamente } from "./lib/cli.mjs";
import { RAIZ } from "./lib/raiz.mjs";

export function validarPerfil(raiz = RAIZ, modo) {
  const faltando = [];
  const ler = (arq) => {
    const p = resolve(raiz, arq);
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, "utf-8")); }
    catch { faltando.push(`${arq}: JSON inválido ou ilegível`); return null; }
  };

  const perfil = ler("perfil/perfil.json");
  const estilo = ler("perfil/estilo.json");
  modo ??= perfil?.modo ?? "avatar";
  if (!["avatar", "gravado"].includes(modo)) throw new Error("Modo inválido: use avatar ou gravado.");

  if (!perfil) faltando.push("perfil/perfil.json");
  else {
    const campos = modo === "gravado" ? ["nome", "nicho"] : ["nome", "nicho", "avatar", "cenario", "figurino"];
    for (const k of campos) if (!perfil[k] || /^(Seu Nome|descreva)/.test(String(perfil[k]))) faltando.push(`perfil.${k}`);
  }
  if (!estilo) faltando.push("perfil/estilo.json");
  else {
    const refs = estilo.origem?.videosReferencia ?? [];
    if (refs.length < 4 && !estilo.origem?.aprovadoSemReferencias) faltando.push(`estilo.origem.videosReferencia (tem ${refs.length}, precisa de 4)`);
    for (const k of ["cores", "fontes", "legenda", "layout"]) if (!estilo[k]) faltando.push(`estilo.${k}`);
    for (const [nome, f] of Object.entries(estilo.fontes ?? {})) {
      if (f?.arquivo && !existsSync(resolve(raiz, f.arquivo))) faltando.push(`fonte "${nome}": arquivo não encontrado (${f.arquivo})`);
    }
  }

  // Decisões informativas não bloqueiam o onboarding nem exigem voz clonada no gravado.
  const avisos = [];
  if (modo === "avatar" && perfil && !perfil.voz?.metodo && perfil.voz?.trocarVoz !== false) {
    avisos.push("voz não definida no perfil: o Passo 7 usará a fala por texto (padrão); para comparar opções, scripts/escolher-voz.mjs");
  }
  if (perfil && !existsSync(resolve(raiz, ".env.local")) && !existsSync(resolve(raiz, ".env"))) {
    avisos.push("nenhum .env encontrado no repositório: crie .env.local na raiz do flow-reel (veja .env.exemplo); variáveis de processo também podem ser usadas");
  }
  const primeiroUso = !perfil && !estilo;
  return { pronto: faltando.length === 0, primeiroUso, faltando, avisos };
}

if (executadoDiretamente(import.meta.url)) {
  try {
    const resultado = validarPerfil(RAIZ, process.argv[2]);
    console.log(JSON.stringify(resultado));
    process.exitCode = resultado.pronto ? 0 : 2;
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
}
