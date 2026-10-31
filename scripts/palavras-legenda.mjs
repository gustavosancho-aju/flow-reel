/**
 * Palavras da legenda com o TEXTO DO ROTEIRO e os TEMPOS da voz final.
 *
 * Usar a transcrição direto na legenda exigia remendos a cada Reel: o transcritor escreve
 * "Grock", "R$ 150,00", inventa um "a" ("comenta a automação") ou engole um "os". Aqui cada
 * palavra do roteiro (com a grafia que você escreveu) é casada com a palavra ouvida e herda
 * o tempo dela; as que não forem ouvidas ficam no meio das vizinhas.
 *
 * Escreva no roteiro.txt do jeito que quer LER na tela (ex.: "R$150"): a conferência e a voz
 * por texto entendem número e "R$" por extenso.
 *
 * Uso: node scripts/palavras-legenda.mjs <roteiro.txt> <palavras.json da voz final> <saida.json>
 * Saída no formato de palavras.json, pronta para gerar-legenda.mjs.
 */
import { readFileSync, writeFileSync } from "fs";
import { mesmaPalavra, normalizar } from "./lib/conferir.mjs";

const [, , roteiroPath, palavrasPath, saida] = process.argv;
if (!roteiroPath || !palavrasPath || !saida) {
  console.error("Uso: node scripts/palavras-legenda.mjs <roteiro.txt> <palavras.json> <saida.json>");
  process.exit(1);
}

// palavras do roteiro, cada uma com suas formas normalizadas ("R$150" → cento e cinquenta reais)
const tokens = readFileSync(roteiroPath, "utf-8").split(/\s+/).filter(Boolean).map((texto) => ({ texto, norm: normalizar(texto) }));
const R = [];
tokens.forEach((t, k) => t.norm.forEach((w) => R.push({ w, token: k })));

const ouvidas = [];
for (const p of JSON.parse(readFileSync(palavrasPath, "utf-8"))) for (const w of normalizar(p.texto)) ouvidas.push({ w, inicio: p.inicio, fim: p.fim });

// alinhamento (distância de edição com tolerância de marca) e caminho de volta
const n = R.length, m = ouvidas.length;
const d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
for (let i = 0; i <= n; i++) d[i][0] = i;
for (let j = 0; j <= m; j++) d[0][j] = j;
for (let i = 1; i <= n; i++)
  for (let j = 1; j <= m; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (mesmaPalavra(R[i - 1].w, ouvidas[j - 1].w) ? 0 : 1));
const par = new Array(n).fill(-1);
for (let i = n, j = m; i > 0 && j > 0; ) {
  const custo = mesmaPalavra(R[i - 1].w, ouvidas[j - 1].w) ? 0 : 1;
  if (d[i][j] === d[i - 1][j - 1] + custo) { if (!custo) par[i - 1] = j - 1; i--; j--; }
  else if (d[i][j] === d[i - 1][j] + 1) i--;
  else j--;
}

// tempo de cada palavra do roteiro = das suas formas casadas
const saidaPalavras = tokens.map((t, k) => {
  const js = R.map((r, i) => (r.token === k ? par[i] : -1)).filter((j) => j >= 0);
  return js.length ? { texto: t.texto, inicio: Math.min(...js.map((j) => ouvidas[j].inicio)), fim: Math.max(...js.map((j) => ouvidas[j].fim)) } : { texto: t.texto, inicio: null, fim: null };
});
// não ouvidas: dividem o vão entre a vizinha anterior e a seguinte
let semPar = 0;
for (let k = 0; k < saidaPalavras.length; k++) {
  if (saidaPalavras[k].inicio !== null) continue;
  let fimBloco = k;
  while (fimBloco + 1 < saidaPalavras.length && saidaPalavras[fimBloco + 1].inicio === null) fimBloco++;
  const antes = saidaPalavras[k - 1]?.fim ?? 0;
  const depois = saidaPalavras[fimBloco + 1]?.inicio ?? antes + 0.3 * (fimBloco - k + 1);
  const passo = Math.max(0.05, (depois - antes) / (fimBloco - k + 1));
  for (let x = k; x <= fimBloco; x++) {
    saidaPalavras[x].inicio = +(antes + passo * (x - k)).toFixed(3);
    saidaPalavras[x].fim = +(antes + passo * (x - k + 1)).toFixed(3);
    semPar++;
  }
  k = fimBloco;
}
writeFileSync(saida, JSON.stringify(saidaPalavras, null, 1));
console.log(`${saidaPalavras.length} palavras do roteiro · ${semPar} sem par na voz (tempo estimado) → ${saida}`);
