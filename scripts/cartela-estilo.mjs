/**
 * Cartela de estilo: uma imagem 1080x1350 que mostra o perfil/estilo.json aplicado
 * (cores com hex, título, pílulas, cartão, legenda e a lista de elementos), para a
 * pessoa confirmar o estilo no onboarding ANTES de existir qualquer vídeo.
 *
 * Uso: node scripts/cartela-estilo.mjs <saida.png>
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { estilo, ffColor, perfil } from "./lib/config.mjs";
import { copiarFonte, ff } from "./lib/midia.mjs";

const saida = process.argv[2];
if (!saida) {
  console.error("Uso: node scripts/cartela-estilo.mjs <saida.png>");
  process.exit(1);
}
const pasta = resolve(dirname(saida), "cartela-trabalho");
mkdirSync(pasta, { recursive: true });

// fontes copiadas para a pasta e referenciadas só pelo nome (caminho com ":" quebra o drawtext)
const fonte = (f) => {
  if (!f?.arquivo || !existsSync(f.arquivo)) return null;
  const nome = "f_" + basename(f.arquivo).replace(/[^A-Za-z0-9._-]/g, "");
  copiarFonte(f.arquivo, resolve(pasta, nome));
  return nome;
};
const fTitulo = fonte(estilo.fontes.titulo);
const fCorpo = fonte(estilo.fontes.corpo) || fTitulo;
const fLegenda = fonte(estilo.fontes.legenda) || fTitulo;

// cada texto vai num arquivo (textfile=) para não precisar escapar acento, vírgula e dois-pontos
let nTexto = 0;
const txt = (conteudo) => {
  const nome = `t${nTexto++}.txt`;
  writeFileSync(resolve(pasta, nome), conteudo, "utf-8");
  return nome;
};
const c = estilo.cores;
const filtros = [];
const caixa = (x, y, w, h, cor, extra = "") => filtros.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${ffColor(cor)}${extra}:t=fill`);
const borda = (x, y, w, h, cor, t = 4) => filtros.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${ffColor(cor)}:t=${t}`);
const texto = (conteudo, x, y, tam, cor, arquivoFonte, extra = "") =>
  // expansion=none: sem isso o drawtext trata "%" como código e some com a linha inteira
  filtros.push(`drawtext=${arquivoFonte ? `fontfile=${arquivoFonte}:` : ""}expansion=none:textfile=${txt(conteudo)}:x=${x}:y=${y}:fontsize=${tam}:fontcolor=${ffColor(cor)}${extra}`);

// cabeçalho
caixa(0, 0, 1080, 10, c.destaque);
texto(`ESTILO DE ${String(estilo.marca?.nome || "").toUpperCase()}`, 60, 60, 30, c.destaque, fTitulo);
texto("SEU TÍTULO AQUI", 60, 110, 96, c.texto, fTitulo);
texto("COM DESTAQUE", 60, 230, 96, c.destaque, fTitulo); // folga para a cauda do Q da linha de cima

// pílulas
caixa(60, 350, 420, 96, "#FFFFFF");
texto("PÍLULA BRANCA", 92, 378, 40, c.fundo, fTitulo);
caixa(510, 350, 420, 96, c.destaque);
texto("PÍLULA DESTAQUE", 538, 378, 40, c.fundo, fTitulo);

// cartão com borda
borda(60, 490, 960, 190, c.destaque, 4);
texto("CARTÃO COM BORDA", 100, 525, 44, c.texto, fTitulo);
texto("texto secundário do cartão", 100, 595, 32, c.textoSecundario || "#B8B8C4", fCorpo);

// paleta com hex
const nomes = ["fundo", "destaque", "texto", "textoSecundario", "alerta", "atencao"];
const rotulos = { textoSecundario: "secundário", atencao: "atenção" };
nomes.forEach((nome, i) => {
  const x = 60 + i * 162;
  caixa(x, 730, 140, 110, c[nome] || "#000000");
  borda(x, 730, 140, 110, "#444450", 2);
  texto(rotulos[nome] || nome, x, 850, 22, c.textoSecundario || "#B8B8C4", fCorpo);
  texto(String(c[nome] || "-").toUpperCase(), x, 880, 24, c.texto, fCorpo);
});

// legenda (como sai no vídeo: caixa alta, contorno, sem caixa de fundo)
const L = estilo.legenda || {};
const amostra = (L.caixaAlta === false ? "assim fica a legenda" : "ASSIM FICA A LEGENDA");
texto(amostra, "(w-tw)/2", 960, Math.round((estilo.fontes.legenda?.tamanho || 32) * 1.5), L.corTexto || c.texto, fLegenda, ":borderw=5:bordercolor=black");
texto(`legenda: ${L.palavrasPorCartela ?? 3} palavras por cartela, a ${L.posicaoVerticalPct ?? 88}% da altura`, "(w-tw)/2", 1040, 24, c.textoSecundario || "#B8B8C4", fCorpo);

// layout, ritmo e elementos
const lay = estilo.layout || {};
texto(`layout: ${lay.tipo || "-"}${lay.alternativo ? ` (alternativo: ${lay.alternativo})` : ""} · ritmo: ${estilo.ritmo?.cortesPorMinuto ?? "-"} cortes/min · velocidade ${perfil.velocidadeFinal ?? estilo.ritmo?.velocidadeFinal ?? "-"}x`, 60, 1100, 24, c.texto, fCorpo);
texto(`fontes: título ${estilo.fontes.titulo?.familia || "-"} · legenda ${estilo.fontes.legenda?.familia || "-"} · corpo ${estilo.fontes.corpo?.familia || "-"}`, 60, 1140, 24, c.texto, fCorpo);
const elementos = (estilo.elementos || []).slice(0, 9);
const meio = Math.ceil(elementos.length / 2);
// uma linha de drawtext por elemento: com "\n" no textfile o ffmpeg desenha a quebra como um quadradinho
elementos.forEach((e, i) => texto("• " + e, i < meio ? 60 : 560, 1190 + (i % meio) * 30, 22, c.textoSecundario || "#B8B8C4", fCorpo));

const nomeSaida = "cartela.png";
ff(["-f", "lavfi", "-i", `color=c=${ffColor(c.fundo)}:s=1080x1350`, "-vf", filtros.join(","), "-frames:v", "1", nomeSaida], { cwd: pasta });
copyFileSync(resolve(pasta, nomeSaida), resolve(saida));
console.log("ok", saida);
