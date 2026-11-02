/**
 * Seleciona o motor de corte; o FFmpeg existente continua como padrão.
 * Uso: node scripts/cortar-video.mjs <entrada> <saida> [ffmpeg|auto-editor] [minSilencio] [margem] [limiar]
 * auto-editor é uma dependência opcional no PATH (ou AUTO_EDITOR_PATH).
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./lib/config.mjs";
import { argumentosAutoEditor } from "./lib/corte.mjs";

const [, , entrada, saida, motor = "ffmpeg", minArg = "0.35", margemArg = "0.12", limiarArg = "0.025"] = process.argv;
if (!entrada || !saida || !["ffmpeg", "auto-editor"].includes(motor)) {
  console.error("Uso: node scripts/cortar-video.mjs <entrada> <saida> [ffmpeg|auto-editor] [minSilencio] [margem] [limiar]");
  process.exit(1);
}
if (resolve(entrada) === resolve(saida)) throw new Error("A saída deve ser diferente do vídeo original.");
const [min, margem, limiar] = [minArg, margemArg, limiarArg].map(Number);
// Valida também os parâmetros repassados ao motor legado.
const autoArgs = argumentosAutoEditor(resolve(entrada), resolve(saida), min, margem, limiar);
const comando = motor === "auto-editor" ? (env.AUTO_EDITOR_PATH || "auto-editor") : process.execPath;
const args = motor === "auto-editor" ? autoArgs : [fileURLToPath(new URL("./cortar-silencio.mjs", import.meta.url)), entrada, saida, String(min), String(margem)];
const resultado = spawnSync(comando, args, { stdio: "inherit", shell: false });
if (resultado.error) {
  console.error(motor === "auto-editor"
    ? "Não foi possível executar auto-editor. Instale o binário oficial, ajuste AUTO_EDITOR_PATH ou use o motor ffmpeg."
    : "Não foi possível executar o motor FFmpeg.");
  process.exit(1);
}
process.exit(resultado.status ?? 1);
