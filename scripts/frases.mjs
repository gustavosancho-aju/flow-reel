/**
 * Monta o frases.json (frase do roteiro + janela de tempo em que o avatar a fala)
 * alinhando o TEXTO DO ROTEIRO com os tempos por palavra da transcrição.
 *
 * Por que alinhar e não usar a transcrição direto: o transcritor escreve "R$ 150"
 * onde o roteiro diz "cento e cinquenta reais", "Grock" onde é "Grok", e às vezes
 * inventa ou engole palavras. O texto que vai para a voz por texto e para a
 * conferência tem que ser o do roteiro; da transcrição só aproveitamos os tempos.
 *
 * Divide o roteiro em frases na pontuação (. , ! ? ; :) e junta pedaços com menos
 * de 3 palavras ao seguinte.
 *
 * Uso: node scripts/frases.mjs <roteiro.txt> <palavras.json> <frases.json>
 *   roteiro.txt   as falas exatas, em ordem (uma cena por linha ou tudo junto)
 *   palavras.json saída de timestamps-palavras.mjs sobre o vídeo limpo (1,0x)
 */
import { readFileSync, writeFileSync } from "fs";
import { normalizar } from "./lib/conferir.mjs";

const [, , roteiroPath, palavrasPath, saida] = process.argv;
if (!roteiroPath || !palavrasPath || !saida) {
  console.error("Uso: node scripts/frases.mjs <roteiro.txt> <palavras.json> <frases.json>");
  process.exit(1);
}

// 1. roteiro em frases
const roteiro = readFileSync(roteiroPath, "utf-8").replace(/\s+/g, " ").trim();
const pedacos = roteiro.split(/(?<=[.,!?;:])\s+/).filter(Boolean);
const frases = [];
for (const p of pedacos) {
  const ultima = frases[frases.length - 1];
  if (ultima && normalizar(ultima).length < 3) frases[frases.length - 1] = ultima + " " + p;
  else frases.push(p);
}
if (frases.length > 1 && normalizar(frases[frases.length - 1]).length < 3) {
  frases[frases.length - 2] += " " + frases.pop();
}

// 2. palavras normalizadas dos dois lados, lembrando de onde cada uma veio
const R = []; // { w, frase }
frases.forEach((f, i) => normalizar(f).forEach((w) => R.push({ w, frase: i })));
const brutas = JSON.parse(readFileSync(palavrasPath, "utf-8"));
const T = []; // { w, inicio, fim }
for (const p of brutas) for (const w of normalizar(p.texto)) T.push({ w, inicio: p.inicio, fim: p.fim });
if (!T.length) throw new Error("palavras.json sem palavras");

// 3. alinhamento por distância de edição (com caminho de volta)
const n = R.length, m = T.length;
const d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
for (let i = 0; i <= n; i++) d[i][0] = i;
for (let j = 0; j <= m; j++) d[0][j] = j;
for (let i = 1; i <= n; i++) {
  for (let j = 1; j <= m; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (R[i - 1].w === T[j - 1].w ? 0 : 1));
  }
}
const par = new Array(n).fill(-1); // índice em T alinhado a cada palavra do roteiro
for (let i = n, j = m; i > 0 && j > 0; ) {
  const custo = R[i - 1].w === T[j - 1].w ? 0 : 1;
  if (d[i][j] === d[i - 1][j - 1] + custo) { par[i - 1] = j - 1; i--; j--; }
  else if (d[i][j] === d[i - 1][j] + 1) i--;
  else j--;
}

// 4. janela de cada frase = do início da primeira à última palavra alinhada
const saidaFrases = frases.map((texto, idx) => {
  const js = R.map((r, i) => (r.frase === idx ? par[i] : -1)).filter((j) => j >= 0);
  if (!js.length) return { texto, inicio: null, fim: null };
  return { texto, inicio: Math.min(...js.map((j) => T[j].inicio)), fim: Math.max(...js.map((j) => T[j].fim)) };
});
// frases sem nenhuma palavra reconhecida: ocupam o vão entre as vizinhas
for (let i = 0; i < saidaFrases.length; i++) {
  const f = saidaFrases[i];
  if (f.inicio !== null) continue;
  const antes = saidaFrases.slice(0, i).reverse().find((x) => x.fim !== null);
  const depois = saidaFrases.slice(i + 1).find((x) => x.inicio !== null);
  f.inicio = antes ? antes.fim + 0.04 : 0;
  f.fim = depois ? depois.inicio - 0.04 : T[T.length - 1].fim;
  f.estimada = true;
}
// sem sobreposição: cada frase termina antes da próxima começar
for (let i = 0; i < saidaFrases.length - 1; i++) {
  const prox = saidaFrases[i + 1];
  if (saidaFrases[i].fim > prox.inicio - 0.04) saidaFrases[i].fim = Math.max(saidaFrases[i].inicio + 0.2, prox.inicio - 0.04);
}
const final = saidaFrases.map((f) => ({ texto: f.texto, inicio: +f.inicio.toFixed(2), fim: +f.fim.toFixed(2), ...(f.estimada ? { estimada: true } : {}) }));
writeFileSync(saida, JSON.stringify(final, null, 1));

const naoAlinhadas = par.filter((j) => j < 0).length;
final.forEach((f, i) => console.log(`${String(i + 1).padStart(2)}. ${f.inicio.toFixed(2)}–${f.fim.toFixed(2)}s ${f.estimada ? "(estimada) " : ""}${f.texto}`));
console.log(`${final.length} frases · ${naoAlinhadas} de ${n} palavras do roteiro sem par na transcrição → ${saida}`);
