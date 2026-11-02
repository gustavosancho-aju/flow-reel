/**
 * Gera legenda dinâmica (.ass) a partir dos timestamps por palavra.
 * Estilo vem de perfil/estilo.json (legenda.*, fontes.legenda, cores): palavras
 * por cartela, cor, fonte, tamanho e altura. Padrão: 3 palavras, branca, sombra,
 * sem caixa, tamanho 32, a ~88% da altura, por baixo da boca no cartão do rosto.
 *
 * Uso: node gerar-legenda.mjs <palavras.json> <saida.ass> [9:16|16:9]
 * Queimar: ffmpeg -i video.mp4 -vf "subtitles=saida.ass:fontsdir=<pasta com o arquivo da fonte>" ...
 * O arquivo da fonte é estilo.fontes.legenda.arquivo; sem o fontsdir o libass cai
 * em Arial sem avisar.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { estilo } from "./lib/config.mjs";
import { gerarLegenda } from "./lib/legenda.mjs";
export { gerarLegenda, normalizar, agruparPalavras } from "./lib/legenda.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , entrada, saida, formato] = process.argv;
  if (!entrada || !saida) {
    console.error("Uso: node scripts/gerar-legenda.mjs <palavras.json> <saida.ass> [9:16|16:9]");
    process.exit(1);
  }
  const brutas = JSON.parse(readFileSync(entrada, "utf8"));
  const suprimir = process.env.SUPRIMIR ? JSON.parse(process.env.SUPRIMIR) : [];
  const conteudo = gerarLegenda(brutas, estilo, { formato, suprimir });
  writeFileSync(saida, conteudo, "utf8");
  console.log(`${(conteudo.match(/^Dialogue:/gm) || []).length} cartelas`);
}
