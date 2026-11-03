/** Exemplo gerado do zero: não usa vídeos pessoais, APIs nem um Whisper instalado. */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { RAIZ } from "./lib/raiz.mjs";
import { editarGravado } from "./editar-gravado.mjs";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Uso: npm run exemplo -- [pasta-nova] [9:16|16:9]\nGera vídeo sintético, corta silêncio, queima legendas de demonstração, cria capa e template. Requer npm run configurar e FFmpeg.");
} else {
  try {
    const saida = resolve(args[0] || "test-output/exemplo-local");
    const formato = args[1] || "9:16";
    if (!["9:16", "16:9"].includes(formato)) throw new Error("Use 9:16 ou 16:9.");
    const temporarios = resolve(RAIZ, "test-output"); mkdirSync(temporarios, { recursive: true });
    const entrada = mkdtempSync(resolve(temporarios, "fonte-exemplo-"));
    const video = resolve(entrada, "bruto.mp4"), palavras = resolve(entrada, "palavras.json");
    const tamanho = formato === "9:16" ? "360x640" : "640x360";
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `testsrc2=size=${tamanho}:rate=30`,
      "-f", "lavfi", "-i", "aevalsrc=if(between(t\\,1\\,2)\\,0\\,0.5*sin(2*PI*440*t)):s=44100",
      "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", video], { stdio: "inherit" });
    writeFileSync(palavras, JSON.stringify([{ texto: "EDIÇÃO", inicio: 0.1, fim: 0.6 }, { texto: "LOCAL", inicio: 0.6, fim: 1.0 }, { texto: "DEMONSTRAÇÃO", inicio: 1.3, fim: 1.9 }]));
    const projeto = await editarGravado(video, saida, { formato, cortarSilencio: true, palavras });
    writeFileSync(resolve(saida, "exemplo.json"), JSON.stringify({ ...projeto, origemLegenda: "Fixture demonstrativa, não é transcrição; áudio é um tom sintético." }, null, 2));
    console.log(`Exemplo pronto: ${projeto.final}\nA imagem, o áudio e as palavras são sintéticos. Nenhum serviço externo foi chamado.`);
  } catch (erro) { console.error(erro.message); process.exitCode = 1; }
}
