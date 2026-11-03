/** Edição local inicial: exporta MP4, capa e projeto HyperFrames sem APIs. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ } from "./lib/raiz.mjs";
import { obterFormato } from "./lib/formato.mjs";
import { diagnosticar } from "./diagnostico.mjs";
import { validarPerfil } from "./validar-perfil.mjs";

export async function editarGravado(entrada, pasta, { formato, cortarSilencio = false, palavras } = {}) {
  const requisitos = diagnosticar();
  if (!requisitos.ok) throw new Error(requisitos.itens.filter((i) => !i.ok).map((i) => `${i.nome}: ${i.detalhe}`).join("\n"));
  const perfil = validarPerfil(RAIZ, "gravado");
  if (!perfil.pronto) throw new Error("Configure seu perfil com npm run configurar. Faltam: " + perfil.faltando.join(", "));
  const bruto = resolve(entrada), dir = resolve(pasta);
  if (!existsSync(bruto)) throw new Error(`Vídeo de entrada não encontrado: ${entrada}`);
  if (existsSync(dir) && readdirSync(dir).length) throw new Error("A pasta de saída precisa ser nova ou vazia; seus arquivos não serão sobrescritos.");
  if (formato) obterFormato(formato);
  const run = (cmd, args, cwd = RAIZ) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
  const node = (nome, ...args) => run(process.execPath, [resolve(RAIZ, "scripts", nome), ...args]);
  const preparar = [bruto, dir]; if (formato) preparar.push(formato);
  node("preparar-video-gravado.mjs", ...preparar);
  const projetoPath = resolve(dir, "projeto.json");
  const projeto = JSON.parse(readFileSync(projetoPath, "utf8"));
  const limpo = resolve(dir, "limpo.mp4");
  if (cortarSilencio) node("cortar-video.mjs", resolve(dir, "base.mp4"), limpo, "ffmpeg");
  else copyFileSync(resolve(dir, "base.mp4"), limpo);
  const duracao = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", limpo], { encoding: "utf8" }));
  run("ffmpeg", ["-y", "-v", "error", "-i", limpo, "-vn", "-ac", "1", "-ar", "44100", resolve(dir, "voz-limpa.wav")]);
  node("aplicar-estilo-template.mjs", resolve(dir, "edicao/index.html"), projeto.formato, "gravado");
  mkdirSync(resolve(dir, "edicao/media"), { recursive: true });
  copyFileSync(limpo, resolve(dir, "edicao/media/rosto.mp4"));
  copyFileSync(resolve(dir, "voz-limpa.wav"), resolve(dir, "edicao/media/audio.wav"));
  writeFileSync(resolve(dir, "edicao/hyperframes.json"), JSON.stringify({ paths: { assets: "media" } }, null, 2));
  let comLegenda = false;
  if (palavras) {
    const brutas = JSON.parse(readFileSync(resolve(palavras), "utf8"));
    if (!Array.isArray(brutas) || !brutas.length) throw new Error("O arquivo de palavras precisa conter uma lista não vazia de timestamps do vídeo limpo.");
    if (brutas.some((p) => p.inicio >= duracao || p.fim > duracao + 0.1)) throw new Error("Os timestamps não cabem no vídeo limpo. Transcreva novamente após os cortes.");
    const { gerarLegenda } = await import("./lib/legenda.mjs");
    const { estilo } = await import("./lib/config.mjs");
    writeFileSync(resolve(dir, "palavras.json"), JSON.stringify(brutas, null, 2));
    writeFileSync(resolve(dir, "legenda.ass"), gerarLegenda(brutas, estilo, { formato: projeto.formato, duracao }));
    run("ffmpeg", ["-y", "-v", "error", "-i", "limpo.mp4", "-vf", "subtitles=legenda.ass:fontsdir=edicao/fonts", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "final.mp4"], dir);
    node("verificar-legenda.mjs", resolve(dir, "legenda.ass"), resolve(dir, "final.mp4"));
    comLegenda = true;
  } else run("ffmpeg", ["-y", "-v", "error", "-i", "limpo.mp4", "-c", "copy", "-movflags", "+faststart", "final.mp4"], dir);
  run("ffmpeg", ["-y", "-v", "error", "-ss", String(Math.min(1, duracao / 2)), "-i", limpo, "-frames:v", "1", resolve(dir, "foto.jpg")]);
  node("gerar-capa.mjs", resolve(dir, "foto.jpg"), resolve(dir, "capa.jpg"), projeto.formato);
  Object.assign(projeto, { final: resolve(dir, "final.mp4"), duracao, comLegenda, corteSilencio: cortarSilencio,
    aviso: "Exportação local em 1x. O template HyperFrames é um ponto de partida: personalize seus painéis e tempos antes de renderizar motions." });
  writeFileSync(projetoPath, JSON.stringify(projeto, null, 2) + "\n");
  return projeto;
}

async function main() {
  const ajuda = "Uso: npm run editar -- <bruto.mp4> <pasta-nova> [9:16|16:9] [--cortar-silencio] [--palavras palavras.json]\nSem API: exporta vídeo e capa e prepara o template para motions. Timestamps opcionais devem corresponder ao vídeo já cortado.";
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log(ajuda); return; }
  const [entrada, pasta, ...opcionais] = args;
  if (!entrada || !pasta) throw new Error(ajuda);
  const opcoes = {};
  for (let i = 0; i < opcionais.length; i++) {
    const arg = opcionais[i];
    if (["9:16", "16:9"].includes(arg)) opcoes.formato = arg;
    else if (arg === "--cortar-silencio") opcoes.cortarSilencio = true;
    else if (arg === "--palavras" && opcionais[i + 1]) opcoes.palavras = opcionais[++i];
    else throw new Error(ajuda);
  }
  console.log(JSON.stringify(await editarGravado(entrada, pasta, opcoes), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
