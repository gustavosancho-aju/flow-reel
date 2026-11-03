/** Verifica apenas dependências locais; não autentica nem chama APIs. */
import { spawnSync } from "node:child_process";
import { executadoDiretamente } from "./lib/cli.mjs";
import { RAIZ } from "./lib/raiz.mjs";
import { resolverFonte } from "./lib/fontes.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validarPerfil } from "./validar-perfil.mjs";

export function diagnosticar({ raiz = RAIZ, versaoNode = process.versions.node, executar = spawnSync, modo, plataforma = process.platform } = {}) {
  const itens = [];
  const instalarFFmpeg = plataforma === "darwin"
    ? "Instale brew install ffmpeg-full e coloque o diretório $(brew --prefix ffmpeg-full)/bin no PATH (veja README)."
    : "Instale uma distribuição completa do FFmpeg no PATH, com drawtext, libass/subtitles, libx264 e AAC.";
  itens.push({ nome: "Node.js 22+", ok: Number(versaoNode.split(".")[0]) >= 22, detalhe: versaoNode });
  const rodar = (cmd, args) => {
    const r = executar(cmd, args, { encoding: "utf8", shell: false, timeout: 15000 });
    return { ok: !r.error && r.status === 0, texto: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
  };
  const ffmpeg = rodar("ffmpeg", ["-version"]), ffprobe = rodar("ffprobe", ["-version"]);
  itens.push({ nome: "FFmpeg", ok: ffmpeg.ok, detalhe: ffmpeg.ok ? ffmpeg.texto.split("\n")[0] : instalarFFmpeg });
  itens.push({ nome: "ffprobe", ok: ffprobe.ok, detalhe: ffprobe.ok ? ffprobe.texto.split("\n")[0] : "ffprobe deve estar no PATH junto com FFmpeg." });
  if (ffmpeg.ok) {
    const filtros = rodar("ffmpeg", ["-hide_banner", "-filters"]), encoders = rodar("ffmpeg", ["-hide_banner", "-encoders"]);
    for (const nome of ["drawtext", "subtitles"]) {
      const ok = filtros.ok && new RegExp(`\\b${nome}\\b`).test(filtros.texto);
      itens.push({ nome: `Filtro ${nome}`, ok, detalhe: ok ? "disponível" : instalarFFmpeg });
    }
    for (const nome of ["libx264", "aac"]) {
      const ok = encoders.ok && new RegExp(`\\b${nome}\\b`).test(encoders.texto);
      itens.push({ nome: `Encoder ${nome}`, ok, detalhe: ok ? "disponível" : instalarFFmpeg });
    }
  }
  try {
    const estilo = JSON.parse(readFileSync(resolve(raiz, "perfil/estilo.exemplo.json"), "utf8"));
    for (const fonte of Object.values(estilo.fontes)) if (fonte?.arquivo) resolverFonte(fonte, raiz);
    itens.push({ nome: "Fontes incluídas no clone", ok: true, detalhe: "Poppins e IBM Plex Mono (OFL)." });
  } catch { itens.push({ nome: "Fontes incluídas no clone", ok: false, detalhe: "Restaure assets/fonts e perfil/estilo.exemplo.json a partir do repositório." }); }
  return { ok: itens.every((i) => i.ok), itens, perfil: validarPerfil(raiz, modo),
    opcionais: "Google Flow, transcrição por API ou local, voz clonada, HyperFrames e publicação são configurados quando usados." };
}

if (executadoDiretamente(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Uso: npm run diagnostico -- [--json] [avatar|gravado]");
  } else if (args.some((arg) => !["--json", "avatar", "gravado"].includes(arg))) {
    console.error("Argumento inválido. Uso: npm run diagnostico -- [--json] [avatar|gravado]"); process.exitCode = 1;
  } else {
    const r = diagnosticar({ modo: args.includes("avatar") ? "avatar" : args.includes("gravado") ? "gravado" : undefined });
    if (args.includes("--json")) console.log(JSON.stringify(r));
    else {
      for (const item of r.itens) console.log(`${item.ok ? "OK" : "FALTA"} ${item.nome}: ${item.detalhe}`);
      console.log(r.perfil.pronto ? "Perfil pronto." : "Perfil pendente: execute npm run configurar e confira os itens faltantes.");
      console.log(r.opcionais);
    }
    process.exitCode = r.ok ? 0 : 1;
  }
}
