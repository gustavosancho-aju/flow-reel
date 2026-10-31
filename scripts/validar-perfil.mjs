/**
 * Diz se o skill já foi configurado (perfil + estilo) ou se é o primeiro uso.
 * O SKILL.md roda isto no Passo 0; se "primeiroUso" for true, faz o onboarding.
 *
 * Saída: JSON em uma linha. Código de saída: 0 = pronto, 2 = falta configurar.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { RAIZ } from "./lib/config.mjs";

const faltando = [];
const ler = (arq) => {
  const p = resolve(RAIZ, arq);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : null;
};

const perfil = ler("perfil/perfil.json");
const estilo = ler("perfil/estilo.json");

if (!perfil) faltando.push("perfil/perfil.json");
else {
  for (const k of ["nome", "nicho", "avatar", "cenario", "figurino"]) if (!perfil[k] || /^(Seu Nome|descreva)/.test(String(perfil[k]))) faltando.push(`perfil.${k}`);
}
if (!estilo) faltando.push("perfil/estilo.json");
else {
  const refs = estilo.origem?.videosReferencia ?? [];
  if (refs.length < 4 && !estilo.origem?.aprovadoSemReferencias) faltando.push(`estilo.origem.videosReferencia (tem ${refs.length}, precisa de 4)`);
  for (const k of ["cores", "fontes", "legenda", "layout"]) if (!estilo[k]) faltando.push(`estilo.${k}`);
  for (const [nome, f] of Object.entries(estilo.fontes ?? {})) {
    if (f?.arquivo && !existsSync(f.arquivo)) faltando.push(`fonte "${nome}": arquivo não encontrado (${f.arquivo})`);
  }
}

// avisos não bloqueiam: são decisões que o próprio fluxo resolve na hora certa
const avisos = [];
if (perfil && !perfil.voz?.metodo && perfil.voz?.trocarVoz !== false) {
  avisos.push("voz não definida no perfil: o Passo 7 usará a fala por texto (padrão); para comparar opções, scripts/escolher-voz.mjs");
}
if (perfil && !perfil.envArquivo && !existsSync(resolve(RAIZ, ".env.local")) && !process.env.FLOW_REEL_ENV) {
  avisos.push("nenhum .env encontrado no repositório: crie .env.local (veja .env.exemplo) ou aponte perfil.envArquivo");
}

const primeiroUso = !perfil && !estilo;
console.log(JSON.stringify({ pronto: faltando.length === 0, primeiroUso, faltando, avisos }));
process.exit(faltando.length ? 2 : 0);
