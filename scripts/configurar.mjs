/** Primeiro uso: cria somente arquivos locais, sem sobrescrever perfil ou chaves. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { RAIZ } from "./lib/raiz.mjs";

export function configurar(opcoes, raiz = RAIZ) {
  const { modo, nome, nicho, estiloBasico = false, avatar, cenario, figurino } = opcoes;
  if (!["avatar", "gravado"].includes(modo)) throw new Error("Escolha --modo avatar ou --modo gravado.");
  if (!nome?.trim() || !nicho?.trim()) throw new Error("Informe --nome e --nicho para criar o perfil.");
  if (modo === "avatar" && [avatar, cenario, figurino].some((v) => !v?.trim())) throw new Error("No modo avatar, informe --avatar, --cenario e --figurino.");
  const criados = [], preservados = [];
  const criar = (nomeArquivo, conteudo) => {
    const arquivo = resolve(raiz, nomeArquivo);
    if (existsSync(arquivo)) { preservados.push(nomeArquivo); return; }
    writeFileSync(arquivo, conteudo, { flag: "wx", mode: 0o600 }); criados.push(nomeArquivo);
  };
  mkdirSync(resolve(raiz, "perfil"), { recursive: true });
  const perfil = JSON.parse(readFileSync(resolve(raiz, "perfil/perfil.exemplo.json"), "utf8"));
  Object.assign(perfil, { nome: nome.trim(), nicho: nicho.trim(), modo, velocidadeFinal: modo === "gravado" ? 1 : 1.1 });
  if (modo === "avatar") Object.assign(perfil, { avatar: { nomeNoFlow: avatar.trim(), formato: "selfie" }, cenario: cenario.trim(), figurino: figurino.trim() });
  else { delete perfil.avatar; delete perfil.cenario; delete perfil.figurino; }
  perfil.voz = { ...perfil.voz, metodo: "original", trocarVoz: false };
  perfil.publicacao = { ...perfil.publicacao, instagram: false, linkedin: false };
  criar("perfil/perfil.json", JSON.stringify(perfil, null, 2) + "\n");
  if (estiloBasico) {
    const estilo = JSON.parse(readFileSync(resolve(raiz, "perfil/estilo.exemplo.json"), "utf8"));
    estilo.marca = { nome: nome.trim(), handle: "" };
    estilo.origem = { videosReferencia: [], aprovadoSemReferencias: true, tipo: "estilo-basico-escolhido", extraidoEm: null };
    criar("perfil/estilo.json", JSON.stringify(estilo, null, 2) + "\n");
  }
  criar(".env.local", readFileSync(resolve(raiz, ".env.exemplo"), "utf8"));
  return { modo, criados, preservados, proximoPasso: estiloBasico ? "npm run diagnostico; node scripts/validar-perfil.mjs " + modo : "Configure perfil/estilo.json com as suas referências (Passo 0 do SKILL.md)." };
}

async function main() {
  const args = process.argv.slice(2);
  const ajuda = "Uso: npm run configurar -- --modo gravado --nome \"Seu nome\" --nicho \"Seu assunto\" --estilo-basico\nAvatar: acrescente --avatar \"Eu\" --cenario \"Seu cenário\" --figurino \"Sua roupa\".\nSem --estilo-basico, o estilo será configurado a partir das referências no skill. Sem argumentos, abre o assistente interativo.";
  if (args.includes("--help")) { console.log(ajuda); return; }
  const opcoes = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--estilo-basico") { opcoes.estiloBasico = true; continue; }
    const nome = args[i].replace(/^--/, "");
    if (!["modo", "nome", "nicho", "avatar", "cenario", "figurino"].includes(nome) || !args[i].startsWith("--") || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(ajuda);
    opcoes[nome] = args[++i];
  }
  if (!args.length) {
    if (!process.stdin.isTTY) throw new Error(ajuda);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      opcoes.modo = (await rl.question("Modo (gravado/avatar) [gravado]: ")).trim() || "gravado";
      opcoes.nome = await rl.question("Seu nome: "); opcoes.nicho = await rl.question("Seu assunto ou público: ");
      if (opcoes.modo === "avatar") {
        opcoes.avatar = (await rl.question("Nome do avatar no Flow [Eu]: ")).trim() || "Eu";
        opcoes.cenario = await rl.question("Cenário: "); opcoes.figurino = await rl.question("Figurino: ");
      }
      opcoes.estiloBasico = /^(s|sim)$/i.test((await rl.question("Começar com o estilo básico incluído, sem referências? [s/N]: ")).trim());
    } finally { rl.close(); }
  }
  console.log(JSON.stringify(configurar(opcoes), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
}
