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
import { obterFormato } from "./lib/formato.mjs";

const [, , saida, formatoArg, modo = "avatar"] = process.argv;
if (!saida) {
  console.error("Uso: node scripts/aplicar-estilo-template.mjs <edicao/index.html> [9:16|16:9] [avatar|gravado]");
  process.exit(1);
}
if (!["avatar", "gravado"].includes(modo)) throw new Error("Modo inválido: use avatar ou gravado.");
const formato = obterFormato(formatoArg);
const horizontal = formato.nome === "16:9";
const c = estilo.cores;
const t = estilo.fontes.titulo;
const tokens = {
  LARGURA: formato.largura, ALTURA: formato.altura,
  VIDEO_GRAVADO: modo === "gravado", AJUSTE_VIDEO: modo === "gravado" ? "contain" : "cover",
  GEOMETRIA_DIVIDIDO: horizontal ? "left: 900, top: 80, width: 960, height: 920" : "left: 40, top: 930, width: 1000, height: 880",
  CSS_HORIZONTAL: horizontal ? `
    #panel { left: 50px; top: 170px; transform: scale(0.8); transform-origin: 0 0; }
    #etiqueta { top: 55px; }
    #titulo { width: 1920px; top: 150px; font-size: 96px; }
    #fim { left: 480px; top: 730px; }
    .pill { left: 510px; top: 890px; height: 110px; }
    #bar { width: 1920px; }
  ` : "",
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
