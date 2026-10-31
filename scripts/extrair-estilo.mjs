/**
 * Prepara a análise de estilo a partir de vídeos de referência (ideal: 4).
 *
 * Para cada vídeo gera, em perfil/referencias/refN/:
 *   - quadros/        12 quadros espalhados pelo vídeo
 *   - folha.jpg       grade 4x3 com esses quadros (para o Claude olhar)
 *   - abertura.jpg    6 quadros dos 3 primeiros segundos (gancho)
 *   - fim.jpg         4 quadros dos últimos 4 segundos (CTA)
 * e um resumo em perfil/referencias/analise.json:
 *   duração, resolução, fps, cortes por minuto (detecção de cena) e paleta
 *   dominante (hex), ignorando cinzas muito neutros.
 *
 * O que um script não enxerga (famílias de fonte, tipo de layout, elementos
 * gráficos, estilo da legenda) o Claude lê nas folhas e confirma com a pessoa;
 * depois grava perfil/estilo.json. Veja a seção "Primeiro uso" do SKILL.md.
 *
 * Uso: node scripts/extrair-estilo.mjs <video1> [video2 ... video4]
 *      Aceita caminho local ou URL (URL exige yt-dlp instalado).
 */
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, resolve } from "path";
import { RAIZ } from "./lib/config.mjs";

const entradas = process.argv.slice(2);
if (!entradas.length) {
  console.error("Uso: node scripts/extrair-estilo.mjs <video1> [video2 ... video4]");
  process.exit(1);
}
if (entradas.length !== 4) {
  console.warn(`Aviso: o recomendado são 4 vídeos de referência (recebi ${entradas.length}). Seguindo mesmo assim.`);
}

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: opts.binary ? "buffer" : "utf-8", maxBuffer: 256 * 1024 * 1024, ...opts });

function probe(arq) {
  const r = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", arq]);
  if (r.status !== 0) throw new Error("ffprobe falhou em " + arq + ": " + r.stderr);
  const j = JSON.parse(r.stdout);
  const [n, d] = (j.streams[0].r_frame_rate || "30/1").split("/").map(Number);
  return { largura: j.streams[0].width, altura: j.streams[0].height, fps: Math.round((n / (d || 1)) * 100) / 100, duracao: Number(j.format.duration) };
}

function baixarSeUrl(e, destino) {
  if (!/^https?:\/\//i.test(e)) return resolve(e);
  const alvo = resolve(destino, "video.mp4");
  const r = run("yt-dlp", ["-f", "mp4/best", "-o", alvo, "--no-playlist", e], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("yt-dlp falhou (instale com 'pip install yt-dlp') ou baixe o vídeo e passe o caminho local: " + e);
  return alvo;
}

/** Paleta dominante: quantiza cada pixel de quadros pequenos em baldes de 5 bits e conta. */
function paleta(arq, dur) {
  const baldes = new Map();
  // cores VIVAS (candidatas a cor de destaque da marca), agrupadas por matiz de 10 em 10 graus.
  // A média por quantização puxava o neon para o tom do brilho difuso (#04843C em vez de #00FF66)
  // e deixava passar tom de pele; aqui só entram pixels saturados E claros, e a cor de cada
  // grupo é medida nos pixels mais brilhantes dele.
  const vivas = Array.from({ length: 36 }, () => ({ n: 0, nb: 0, r: 0, g: 0, b: 0 }));
  let pixels = 0;
  const N = 16;
  for (let i = 0; i < N; i++) {
    const t = ((i + 0.5) / N) * dur;
    const r = run("ffmpeg", ["-v", "error", "-ss", String(t), "-i", arq, "-frames:v", "1", "-vf", "scale=108:192", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { binary: true });
    if (r.status !== 0 || !r.stdout?.length) continue;
    const b = r.stdout;
    for (let p = 0; p + 2 < b.length; p += 3) {
      const r8 = b[p], g8 = b[p + 1], b8 = b[p + 2];
      pixels++;
      const R = r8 >> 3, G = g8 >> 3, B = b8 >> 3;
      const k = (R << 10) | (G << 5) | B;
      baldes.set(k, (baldes.get(k) || 0) + 1);
      const mx = Math.max(r8, g8, b8), mn = Math.min(r8, g8, b8);
      const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
      if (s < 0.55 || v < 0.55) continue;
      const d = mx - mn;
      let h = mx === r8 ? ((g8 - b8) / d) % 6 : mx === g8 ? (b8 - r8) / d + 2 : (r8 - g8) / d + 4;
      h = (h * 60 + 360) % 360;
      const grupo = vivas[Math.floor(h / 10) % 36];
      grupo.n++;
      if (v >= 0.8 && s >= 0.7) { grupo.nb++; grupo.r += r8; grupo.g += g8; grupo.b += b8; }
    }
  }
  const total = [...baldes.values()].reduce((a, b) => a + b, 0) || 1;
  const lista = [...baldes.entries()].map(([k, n]) => {
    const R = ((k >> 10) & 31) * 8 + 4, G = ((k >> 5) & 31) * 8 + 4, B = (k & 31) * 8 + 4;
    return { R, G, B, n, sat: Math.max(R, G, B) - Math.min(R, G, B) };
  }).sort((a, b) => b.n - a.n);
  // junta cores parecidas (distância no RGB) e devolve as 6 maiores
  const out = [];
  for (const c of lista) {
    const perto = out.find((o) => Math.hypot(o.R - c.R, o.G - c.G, o.B - c.B) < 48);
    if (perto) perto.n += c.n;
    else out.push({ ...c });
  }
  const hex = (c) => "#" + [c.R, c.G, c.B].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("").toUpperCase();
  const base = out.sort((a, b) => b.n - a.n).slice(0, 6).map((c) => ({ hex: hex(c), pct: Math.round((c.n / total) * 1000) / 10, saturada: c.sat > 60 }));
  const grupos = vivas
    .map((g, i) => ({ matiz: i * 10 + 5, pct: Math.round((g.n / (pixels || 1)) * 10000) / 100, hex: g.nb ? hex({ R: Math.round(g.r / g.nb), G: Math.round(g.g / g.nb), B: Math.round(g.b / g.nb) }) : null }))
    .filter((g) => g.pct >= 0.2 && g.hex)
    .sort((a, b) => b.pct - a.pct);
  return { dominantes: base, vivas: grupos.slice(0, 4), candidataDestaque: grupos[0]?.hex ?? null };
}

function cortes(arq, dur) {
  const r = run("ffmpeg", ["-v", "info", "-i", arq, "-vf", "select='gt(scene,0.30)',showinfo", "-an", "-f", "null", "-"]);
  const n = ((r.stderr || "").match(/pts_time:/g) || []).length;
  return { quantidade: n, porMinuto: Math.round((n / (dur / 60)) * 10) / 10 };
}

function folha(arq, saida, tempos, colunas, largura) {
  const args = ["-y", "-v", "error"];
  tempos.forEach((t) => args.push("-ss", String(Math.max(0, t)), "-i", arq));
  const n = tempos.length;
  const filtros = tempos.map((_, i) => `[${i}:v]scale=${largura}:-2,setsar=1[v${i}]`);
  // xstack não aceita multiplicação: posição = soma de w0 (colunas) e h0 (linhas)
  const soma = (k, t) => (k === 0 ? "0" : Array(k).fill(t).join("+"));
  const lay = tempos.map((_, i) => `${soma(i % colunas, "w0")}_${soma(Math.floor(i / colunas), "h0")}`).join("|");
  args.push("-filter_complex", `${filtros.join(";")};${tempos.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${n}:layout=${lay}[o]`, "-map", "[o]", "-frames:v", "1", saida);
  const r = run("ffmpeg", args);
  if (r.status !== 0) throw new Error("folha falhou: " + r.stderr);
}

const baseDir = resolve(RAIZ, "perfil", "referencias");
mkdirSync(baseDir, { recursive: true });
const analise = { geradoEm: new Date().toISOString(), videos: [] };

entradas.forEach((e, idx) => {
  const dir = resolve(baseDir, `ref${idx + 1}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(resolve(dir, "quadros"), { recursive: true });
  const arq = baixarSeUrl(e, dir);
  if (!existsSync(arq)) throw new Error("Arquivo não encontrado: " + arq);
  const info = probe(arq);
  const tempos = Array.from({ length: 12 }, (_, i) => ((i + 0.5) / 12) * info.duracao);
  tempos.forEach((t, i) => run("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", arq, "-frames:v", "1", "-vf", "scale=540:-2", resolve(dir, "quadros", `q${String(i + 1).padStart(2, "0")}.jpg`)]));
  folha(arq, resolve(dir, "folha.jpg"), tempos, 4, 360);
  folha(arq, resolve(dir, "abertura.jpg"), Array.from({ length: 6 }, (_, i) => (i * 3) / 6 + 0.1), 3, 360);
  folha(arq, resolve(dir, "fim.jpg"), Array.from({ length: 4 }, (_, i) => Math.max(0, info.duracao - 4 + i)), 4, 360);
  const res = { id: `ref${idx + 1}`, origem: /^https?:/i.test(e) ? e : basename(e), ...info, cortes: cortes(arq, info.duracao), cores: paleta(arq, info.duracao), pasta: `perfil/referencias/ref${idx + 1}`, folha: `perfil/referencias/ref${idx + 1}/folha.jpg`, abertura: `perfil/referencias/ref${idx + 1}/abertura.jpg`, fim: `perfil/referencias/ref${idx + 1}/fim.jpg` };
  analise.videos.push(res);
  console.log(`ref${idx + 1}: ${info.largura}x${info.altura} · ${info.duracao.toFixed(1)}s · ${res.cortes.porMinuto} cortes/min · destaque? ${res.cores.candidataDestaque ?? "-"} · ${res.cores.dominantes.map((c) => c.hex).join(" ")}`);
});

// consenso simples entre os vídeos: média de cortes/min e cores que se repetem
const contagem = new Map();
analise.videos.forEach((v) => v.cores.dominantes.forEach((c) => {
  const k = c.hex;
  const parecida = [...contagem.keys()].find((o) => {
    const a = o.slice(1).match(/../g).map((x) => parseInt(x, 16));
    const b = k.slice(1).match(/../g).map((x) => parseInt(x, 16));
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 60;
  });
  const chave = parecida || k;
  const cur = contagem.get(chave) || { videos: new Set(), saturada: c.saturada };
  cur.videos.add(v.id);
  contagem.set(chave, cur);
}));
// destaque por consenso: o matiz vivo que aparece em mais vídeos (vizinhos de ±10° somam)
const porMatiz = new Map();
analise.videos.forEach((v) => (v.cores.vivas || []).forEach((g) => {
  const chave = [...porMatiz.keys()].find((m) => Math.min(Math.abs(m - g.matiz), 360 - Math.abs(m - g.matiz)) <= 10) ?? g.matiz;
  const cur = porMatiz.get(chave) || { videos: new Set(), pct: 0, amostras: [] };
  cur.videos.add(v.id);
  cur.pct += g.pct;
  cur.amostras.push(g.hex);
  porMatiz.set(chave, cur);
}));
const destaques = [...porMatiz.entries()]
  .map(([matiz, v]) => ({ matiz, emVideos: v.videos.size, pctSomado: Math.round(v.pct * 100) / 100, hex: v.amostras.sort((a, b) => parseInt(b.slice(1), 16) - parseInt(a.slice(1), 16))[0], variantes: [...new Set(v.amostras)] }))
  .sort((a, b) => b.emVideos - a.emVideos || b.pctSomado - a.pctSomado);

analise.resumo = {
  cortesPorMinutoMedia: Math.round((analise.videos.reduce((a, v) => a + v.cortes.porMinuto, 0) / analise.videos.length) * 10) / 10,
  destaqueConsenso: destaques[0] ? { hex: destaques[0].hex, emVideos: destaques[0].emVideos, de: analise.videos.length, variantes: destaques[0].variantes } : null,
  outrasCoresVivas: destaques.slice(1, 4).map(({ hex, emVideos }) => ({ hex, emVideos })),
  coresQueSeRepetem: [...contagem.entries()].filter(([, v]) => v.videos.size >= 2).map(([hex, v]) => ({ hex, emVideos: v.videos.size, saturada: v.saturada })),
};
writeFileSync(resolve(baseDir, "analise.json"), JSON.stringify(analise, null, 2));
console.log("\nResumo:", JSON.stringify(analise.resumo));
console.log("Análise em perfil/referencias/analise.json. Agora olhe as folhas (folha.jpg, abertura.jpg, fim.jpg de cada refN).");
