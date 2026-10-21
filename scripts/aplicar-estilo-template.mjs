/**
 * Gera o index.html da edição a partir de assets/edicao-template.html,
 * trocando os tokens {{...}} pelas cores e fontes de perfil/estilo.json, e
 * copia os arquivos de fonte para <pasta-da-saida>/fonts/.
 *
 * O template é o PONTO DE PARTIDA (layout dividido, abertura, painéis, CTA).
 * O conteúdo dos painéis (textos, cartões) é reescrito por Reel; a identidade
 * (cores, fontes, raio do cartão, barra, flash) vem do estilo.
 *
 * Uso: node scripts/aplicar-estilo-template.mjs <edicao/index.html>
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { RAIZ, estilo, rgb } from "./lib/config.mjs";

const saida = process.argv[2];
if (!saida) {
  console.error("Uso: node scripts/aplicar-estilo-template.mjs <edicao/index.html>");
  process.exit(1);
}
const c = estilo.cores;
const t = estilo.fontes.titulo;
const tokens = {
  DESTAQUE: c.destaque, DESTAQUE_RGB: rgb(c.destaque),
  FUNDO: c.fundo,
  ALERTA: c.alerta || "#FF5A5A", ALERTA_RGB: rgb(c.alerta || "#FF5A5A"),
  ATENCAO: c.atencao || "#FFB020", ATENCAO_RGB: rgb(c.atencao || "#FFB020"),
  FONTE_TITULO: t.familia,
  FONTE_TITULO_ARQUIVO: basename(t.arquivo),
  FONTE_CORPO: estilo.fontes.corpo.familia,
  FONTE_CORPO_ARQUIVO: basename(estilo.fontes.corpo.arquivo),
};
let html = readFileSync(resolve(RAIZ, "assets/edicao-template.html"), "utf-8");
for (const [k, v] of Object.entries(tokens)) html = html.split(`{{${k}}}`).join(v);
const sobra = html.match(/\{\{[A-Z_]+\}\}/g);
if (sobra) throw new Error("Tokens sem valor: " + [...new Set(sobra)].join(", "));

const pasta = dirname(resolve(saida));
mkdirSync(resolve(pasta, "fonts"), { recursive: true });
const copiadas = new Set();
for (const f of Object.values(estilo.fontes)) {
  if (!f?.arquivo || copiadas.has(f.arquivo)) continue;
  copiadas.add(f.arquivo);
  copyFileSync(f.arquivo, resolve(pasta, "fonts", basename(f.arquivo)));
}
writeFileSync(resolve(saida), html);
console.log("ok", saida, "· fontes copiadas para", resolve(pasta, "fonts"));
