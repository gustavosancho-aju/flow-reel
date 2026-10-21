/**
 * Gera as cenas de motion do Reel em código, com os tokens do Design System.
 *
 * Por que em código e não no Veo: modelo de vídeo erra texto em português
 * (já saiu "SPRINT HÁIH", "CORETOR", lorem ipsum). Aqui a grafia é exata,
 * custa zero crédito e dá para regerar quantas vezes quiser.
 *
 * Uso: node design-system/reels-flow/gerar-motion.mjs <diretorio-de-saida>
 * Requer: ffmpeg no PATH.
 */
import { execFileSync } from "child_process";
import { mkdirSync, copyFileSync, existsSync } from "fs";
import { resolve } from "path";
import { env, estilo, perfil, ffColor, assColor, rgb } from "./lib/config.mjs";

const SAIDA = resolve(process.argv[2] ?? "motion");
mkdirSync(SAIDA, { recursive: true });

// O drawtext não aceita bem o "C:" do caminho da fonte (o escape de ":" quebra o
// parser do filtergraph). Copiar a fonte para a pasta de saída e rodar o ffmpeg
// com cwd nela resolve de vez: o filtro passa a usar só o nome do arquivo.
const FONTE_ORIGEM = "C:/Windows/Fonts/arialbd.ttf";
if (!existsSync(resolve(SAIDA, "fonte.ttf"))) {
  copyFileSync(FONTE_ORIGEM, resolve(SAIDA, "fonte.ttf"));
}

// Design System
const FUNDO = ffColor(estilo.cores.fundo);
const VERDE = ffColor(estilo.cores.destaque);
const BRANCO = "0xFFFFFF";
const FONTE = "fonte.ttf"; // relativo ao cwd do ffmpeg (ver cópia acima)
const W = 720;
const H = 1280;
const FPS = 24;

/**
 * Escapa vírgulas de uma expressão. Sem isso o ffmpeg lê a vírgula de dentro de
 * `if(lt(t,0.2),...)` como separador de filtro e recusa o filtergraph inteiro.
 */
function expr(e) {
  return e.replace(/,/g, "\\,");
}

/** Fade de entrada e saída em função do tempo, para não estourar corte seco. */
function alpha(dur, entrada = 0.18, saida = 0.22) {
  return `if(lt(t,${entrada}),t/${entrada},if(gt(t,${dur - saida}),max(0,(${dur}-t)/${saida}),1))`;
}

function texto({ text, y, size, cor = BRANCO, dur, subir = 18, atraso = 0 }) {
  const a = atraso
    ? `if(lt(t,${atraso}),0,${alpha(dur, 0.18, 0.22)})`
    : alpha(dur, 0.18, 0.22);
  // sobe alguns pixels ao entrar — dá vida sem precisar de escala
  const yExpr = `${y}-${subir}*(1-min(max(t-${atraso},0)/0.28,1))`;
  return [
    `drawtext=fontfile=${FONTE}`,
    `text=${text}`,
    `fontcolor=${cor}`,
    `fontsize=${size}`,
    `x=(w-text_w)/2`,
    `y=${expr(yExpr)}`,
    `alpha=${expr(a)}`,
  ].join(":");
}

/**
 * Barra verde que cresce do centro — assinatura visual das peças.
 * Atenção: dentro do drawbox, `w`/`h` são as dimensões da CAIXA; o quadro é
 * `iw`/`ih`. Usar `w`/`h` aqui joga a barra para o canto superior esquerdo.
 */
function barra({ y, dur, largura = 420, altura = 8, atraso = 0 }) {
  const prog = `min(max(t-${atraso},0)/0.35,1)`;
  const yFrame = String(y).replace(/\bh\b/g, "ih");
  return [
    `drawbox=x=${expr(`(iw-${largura}*${prog})/2`)}`,
    `y=${expr(yFrame)}`,
    `w=${expr(`${largura}*${prog}`)}`,
    `h=${altura}`,
    `color=${VERDE}@0.95`,
    `t=fill`,
  ].join(":");
}

/**
 * Trilha sintética das peças. Um insert mudo no meio da fala soa como falha de
 * áudio — estes sons curtos dão continuidade sem precisar de banco de efeitos.
 * `impacto`: grave curto com click. `whoosh`: ruído filtrado subindo.
 */
function som(tipo, dur) {
  if (tipo === "whoosh") {
    return `0.22*(random(0)*2-1)*sin(2*PI*t/${dur})*sin(2*PI*t/${dur})`;
  }
  // impacto: senoide grave caindo de tom + estalo de ruído bem curto
  return (
    `0.55*sin(2*PI*(68+46*exp(-9*t))*t)*exp(-5.5*t)` +
    `+0.16*(random(0)*2-1)*exp(-16*t)`
  );
}

function render(nome, dur, filtros, tipoSom = "impacto") {
  const arquivo = resolve(SAIDA, `${nome}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=c=${FUNDO}:s=${W}x${H}:d=${dur}:r=${FPS}`,
    "-f", "lavfi", "-i", `aevalsrc=${expr(som(tipoSom, dur))}:d=${dur}:s=44100`,
    "-vf", filtros.join(","),
    "-t", String(dur),
    "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ac", "1",
    `${nome}.mp4`,
  ], { stdio: "inherit", cwd: SAIDA });
  console.log(`  ${nome}.mp4 (${dur}s)`);
  return arquivo;
}

console.log(`gerando cenas de motion em ${SAIDA}`);

// 1. Abertura — entra antes do gancho, se quiser abrir com marca
render("motion-abertura", 1.6, [
  texto({ text: "USEI UMA", y: "h/2-150", size: 62, dur: 1.6 }),
  texto({ text: "AUTOMAÇÃO", y: "h/2-70", size: 92, cor: VERDE, dur: 1.6, atraso: 0.12 }),
  barra({ y: "h/2+40", dur: 1.6, atraso: 0.25 }),
  texto({ text: "PRA CRIAR ESSE VÍDEO", y: "h/2+90", size: 42, dur: 1.6, atraso: 0.38 }),
]);

// 2. A virada — entra antes da cena do comando.
// Curto de propósito: é um corte no meio da fala, e acima de ~1s soa como
// travada em vez de ênfase.
render("motion-1-comando", 0.9, [
  texto({ text: "1", y: "h/2-170", size: 210, cor: VERDE, dur: 0.9 }),
  texto({ text: "COMANDO", y: "h/2+60", size: 86, dur: 0.9, atraso: 0.1 }),
  barra({ y: "h/2+170", dur: 0.9, atraso: 0.16, largura: 300 }),
]);

// 3. Contraste — o antes e o depois em números
render("motion-antes-depois", 1.8, [
  texto({ text: "ANTES", y: "h/2-240", size: 54, dur: 1.8 }),
  texto({ text: "1 DIA", y: "h/2-160", size: 96, dur: 1.8, atraso: 0.1 }),
  barra({ y: "h/2-30", dur: 1.8, atraso: 0.3, largura: 360 }),
  texto({ text: "AGORA", y: "h/2+40", size: 54, dur: 1.8, atraso: 0.45 }),
  texto({ text: "4 MINUTOS", y: "h/2+120", size: 96, cor: VERDE, dur: 1.8, atraso: 0.55 }),
]);

// 4. CTA de fechamento — a keyword isolada, que a fala não entregou limpa
render("motion-cta", 2.2, [
  texto({ text: "COMENTA", y: "h/2-140", size: 68, dur: 2.2 }),
  texto({ text: "AUTOMAÇÃO", y: "h/2-50", size: 96, cor: VERDE, dur: 2.2, atraso: 0.14 }),
  barra({ y: "h/2+70", dur: 2.2, atraso: 0.28 }),
  texto({ text: "QUE EU TE MOSTRO", y: "h/2+120", size: 46, dur: 2.2, atraso: 0.4 }),
]);

// 5. Transição curta — placa verde varrendo o quadro, para emendar cenas.
// Feita com overlay (e não drawbox): só o overlay reavalia a posição a cada
// frame; o drawbox resolve x uma vez na configuração e não anima.
(function transicao() {
  const dur = 0.5;
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=c=${FUNDO}:s=${W}x${H}:d=${dur}:r=${FPS}`,
    "-f", "lavfi", "-i", `color=c=${VERDE}:s=${W}x${H}:d=${dur}:r=${FPS}`,
    "-f", "lavfi", "-i", `aevalsrc=${expr(som("whoosh", dur))}:d=${dur}:s=44100`,
    "-filter_complex", `[0][1]overlay=x=${expr(`-W+(W*2)*min(t/${dur},1)`)}:y=0[v]`,
    "-map", "[v]", "-map", "2:a",
    "-t", String(dur),
    "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "motion-transicao.mp4",
  ], { stdio: "inherit", cwd: SAIDA });
  console.log(`  motion-transicao.mp4 (${dur}s)`);
})();

console.log("pronto");
