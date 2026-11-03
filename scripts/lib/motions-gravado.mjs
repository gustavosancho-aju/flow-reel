import { copyFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { obterFormato } from './formato.mjs';
import { copiarFonte } from './midia.mjs';
import { RAIZ } from './raiz.mjs';
const require = createRequire(import.meta.url);
const html = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function destaques(palavras, duracao) {
  const saida = []; let proximo = 0;
  for (let i = 0; i < palavras.length; i++) {
    if (palavras[i].inicio < proximo || palavras[i].inicio >= duracao - 0.5) continue;
    const grupo = palavras.slice(i, i + 6).filter(p => p.inicio < duracao);
    const inicio = grupo[0].inicio, fim = Math.min(duracao, Math.max(inicio + 2, grupo.at(-1).fim));
    saida.push({ texto: grupo.map(p => p.texto).join(' '), inicio, fim });
    proximo = fim + 4;
  }
  return saida;
}

export function templateGravado({ formato, duracao, palavras = [], estilo }) {
  if (!Number.isFinite(duracao) || duracao <= 0) throw new Error('Duração inválida para motions.');
  const { largura: w, altura: h } = obterFormato(formato);
  const cor = /^#[0-9a-f]{6}$/i.test(estilo.cores.destaque) ? estilo.cores.destaque : '#00FF66';
  const itens = destaques(palavras, duracao);
  const clips = itens.map((p,i) => `<div id="clip-${i}" class="clip" data-start="${p.inicio}" data-duration="${p.fim-p.inicio}" data-track-index="${i+2}" data-track-kind="graphics"><div class="card" id="card-${i}" data-var-text="destaque-${i}">${html(p.texto)}</div></div>`).join('\n');
  const tweens = itens.map((p,i) => {
    const d = Math.min(0.35,(p.fim-p.inicio)/3);
    return `tl.fromTo('#card-${i}', {opacity:0,y:24}, {opacity:1,y:0,duration:${d},ease:'power2.out',immediateRender:false}, ${p.inicio});
tl.to('#card-${i}', {opacity:0,y:-12,duration:${d},ease:'power2.in'}, ${p.fim-d});`;
  }).join('\n');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><script src="assets/gsap.min.js"></script><style>
@font-face{font-family:FlowTitle;src:url('assets/fonts/${html(basename(estilo.fontes.titulo.arquivo))}');font-weight:700}
*{box-sizing:border-box}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#000}
#root{position:relative;width:100%;height:100%;color:white;font-family:FlowTitle,sans-serif}
#rosto{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.card{position:absolute;left:10%;top:11%;width:80%;padding:24px 32px;border-left:8px solid ${cor};border-radius:16px;background:rgba(8,14,18,.9);font-size:${w===1080?44:42}px;line-height:1.2;overflow-wrap:anywhere}
#progresso{position:absolute;left:0;top:0;width:100%;height:8px;background:${cor};transform-origin:left center}
</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${duracao}" data-width="${w}" data-height="${h}">
<video id="rosto" class="clip" src="assets/rosto.mp4" data-start="0" data-duration="${duracao}" data-track-index="0" muted playsinline></video>
<audio id="voz" class="clip" src="assets/audio.wav" data-start="0" data-duration="${duracao}" data-track-index="1"></audio>
${clips}<div id="progresso" data-layout-ignore="true"></div></div><script>
const tl=gsap.timeline({paused:true});
tl.fromTo('#progresso',{scaleX:0},{scaleX:1,duration:${duracao},ease:'none'},0);
${tweens}
window.__timelines=window.__timelines||{};window.__timelines.main=tl;
</script></body></html>`;
}

export function prepararMotions(pasta, opcoes, video, audio) {
  const assets = resolve(pasta, 'assets'); mkdirSync(resolve(assets,'fonts'), { recursive:true });
  copyFileSync(video, resolve(assets,'rosto.mp4'));
  copyFileSync(audio, resolve(assets,'audio.wav'));
  copyFileSync(require.resolve('gsap/dist/gsap.min.js'), resolve(assets,'gsap.min.js'));
  for (const f of Object.values(opcoes.estilo.fontes)) if (f?.arquivo) copiarFonte(f.arquivo,resolve(assets,'fonts',basename(f.arquivo)));
  writeFileSync(resolve(pasta,'index.html'),templateGravado(opcoes));
  writeFileSync(resolve(pasta,'hyperframes.json'),JSON.stringify({ paths:{assets:'assets'} },null,2));
}

export function renderizarMotions(pasta, saida, executar = execFileSync) {
  const cli = resolve(RAIZ, 'node_modules/hyperframes/bin/hyperframes.mjs');
  if (!existsSync(cli)) throw new Error('HyperFrames não instalado. Rode npm install ou use --sem-motions.');
  executar(process.execPath, [cli, 'check'], { cwd:pasta, stdio:'inherit' });
  executar(process.execPath, [cli, 'render', '--output', saida], { cwd:pasta, stdio:'inherit' });
  if (!existsSync(saida)) throw new Error('HyperFrames não gerou o arquivo de saída.');
}
