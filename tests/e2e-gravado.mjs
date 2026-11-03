/** Teste real de mídia; publicação sempre simulada. ASR real ou fixture explicitamente informada. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const [entrada, saida, fixture] = process.argv.slice(2);
if (!entrada || !saida) throw new Error('Uso: node tests/e2e-gravado.mjs video-real.mp4 pasta-nova [palavras-fixture.json]');
const pasta=resolve(saida);mkdirSync(pasta,{recursive:true});
if(fixture) process.env.GROQ_API_KEY='fixture-offline-nao-e-chave';
const { editarGravado } = await import('../scripts/editar-gravado.mjs');
const { transcreverArquivo } = await import('../scripts/lib/transcricao.mjs');
const { env } = await import('../scripts/lib/config.mjs');
if(!fixture&&!env.GROQ_API_KEY&&!env.OPENAI_API_KEY) throw new Error('Configure Groq/OpenAI ou forneça explicitamente uma transcrição fixture para o teste offline.');
const palavras=fixture?JSON.parse(readFileSync(fixture,'utf8')):null;
const chamadas=[];
const transcrever=fixture?async (arquivo,duracao,selecionado)=>transcreverArquivo(arquivo,duracao,selecionado,async(url,opts)=>{
  chamadas.push({provedor:selecionado.provedor,bytes:opts.body.get('file').size,simulado:true});
  return new Response(JSON.stringify({words:palavras.map(p=>({word:p.texto,start:p.inicio,end:p.fim}))}),{status:200});
}):undefined;
const resultados=[];
for(const formato of ['9:16','16:9']) {
  const dir=resolve(pasta,formato==='9:16'?'vertical':'horizontal');
  const r=await editarGravado(entrada,dir,{formato,cortarSilencio:true},{...(transcrever?{transcrever}:{})});
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',r.final],{encoding:'utf8'}));
  const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
  if(!a||v.width!==r.largura||v.height!==r.altura||Math.abs(Number(probe.format.duration)-r.duracao)>0.15) throw new Error('Mídia final diverge de formato, áudio ou duração esperada.');
  execFileSync(process.execPath,['scripts/verificar-legenda.mjs',resolve(dir,'legenda.ass'),r.final],{stdio:'inherit'});
  const texto=resolve(dir,'publicacao.txt');writeFileSync(texto,'Teste local de edição de vídeo gravado.');
  execFileSync(process.execPath,['scripts/publicar-instagram.mjs','https://example.invalid/video.mp4','https://example.invalid/capa.jpg',texto,'--teste'],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/publicar-linkedin-video.mjs',r.final,texto,'Teste local','--teste'],{stdio:'inherit'});
  resultados.push({...r,sha256:createHash('sha256').update(readFileSync(r.final)).digest('hex'),audio:a.codec_name,video:v.codec_name,publicacao:['instagram','linkedin'].map(rede=>JSON.parse(readFileSync(`${texto}.${rede}-teste.json`)))});
}
const relatorio={ok:true,entrada:resolve(entrada),transcricao:fixture?'Resposta da API simulada com transcrição local previamente obtida do vídeo; sem chamada real ao provedor.':'API real',fixture:fixture?resolve(fixture):null,chamadas,publicadoNaRede:false,resultados};
writeFileSync(resolve(pasta,'relatorio.json'),JSON.stringify(relatorio,null,2));
console.log('E2E concluído:',resolve(pasta,'relatorio.json'));
