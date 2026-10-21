/**
 * Verifica um .ass: nenhum par de cartelas pode ficar visível ao mesmo tempo
 * (duas linhas empilhadas na tela) e nenhuma pode passar do fim do vídeo.
 *
 * Uso: node verificar-legenda.mjs <legenda.ass> <video.mp4>
 * Sai com código 1 se encontrar sobreposição ou cartela além da duração do vídeo.
 */
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const [, , assPath, videoPath] = process.argv;

function segundos(t) {
  const [h, m, s] = t.split(":");
  return Number(h) * 3600 + Number(m) * 60 + parseFloat(s);
}

const eventos = readFileSync(assPath, "utf-8")
  .split("\n")
  .filter((l) => l.startsWith("Dialogue:"))
  .map((l) => {
    const p = l.slice("Dialogue:".length).split(",");
    return {
      inicio: segundos(p[1].trim()),
      fim: segundos(p[2].trim()),
      texto: p.slice(9).join(",").replace(/\{[^}]*\}/g, "").trim(),
    };
  })
  .sort((a, b) => a.inicio - b.inicio);

const duracao = Number(
  execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", videoPath,
  ]).toString().trim()
);

let sobrepostos = 0;
for (let i = 1; i < eventos.length; i++) {
  const a = eventos[i - 1];
  const b = eventos[i];
  // eventos da mesma cartela trocam a palavra destacada: mesmo texto = ok
  if (b.inicio < a.fim - 0.001 && a.texto !== b.texto) {
    sobrepostos++;
    if (sobrepostos <= 5) {
      console.log(`sobreposição em ${b.inicio.toFixed(2)}s: "${a.texto}" x "${b.texto}"`);
    }
  }
}

const foraDoVideo = eventos.filter((e) => e.fim > duracao + 0.01);
const invisiveis = eventos.filter((e) => e.fim - e.inicio < 0.04);

console.log(`eventos             : ${eventos.length}`);
console.log(`duração do vídeo    : ${duracao.toFixed(2)}s`);
console.log(`cartelas sobrepostas: ${sobrepostos}`);
console.log(`passam do fim       : ${foraDoVideo.length}`);
console.log(`curtas demais       : ${invisiveis.length}`);
process.exit(sobrepostos > 0 || foraDoVideo.length > 0 ? 1 : 0);
