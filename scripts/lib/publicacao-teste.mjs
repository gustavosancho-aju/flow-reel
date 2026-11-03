/** Simulador estritamente local. Não é um sandbox das redes e não faz fetch. */
import { writeFileSync } from 'node:fs';
export function criarSimulador(rede) {
  const eventos = [];
  const responder = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json',...headers}});
  return {
    async fetch(url, opts={}) {
      const u=new URL(url), metodo=opts.method??'GET';
      eventos.push({ metodo, caminho:u.pathname, bytes:Buffer.isBuffer(opts.body)?opts.body.length:undefined });
      if (rede==='instagram') {
        if(u.pathname.endsWith('/media') && metodo==='POST') {
          if(opts.body.get('media_type')!=='REELS'||!opts.body.get('video_url')||!opts.body.get('cover_url')) throw new Error('Container de teste incompleto.');
          return responder({id:'container-teste'});
        }
        if(u.pathname.endsWith('/container-teste')) return responder({status_code:'FINISHED'});
        if(u.pathname.endsWith('/media_publish') && metodo==='POST') {
          if(opts.body.get('creation_id')!=='container-teste') throw new Error('Container de teste incorreto.');
          return responder({id:'post-teste'});
        }
        if(u.pathname.endsWith('/post-teste')) return responder({permalink:'simulacao-local://instagram/post-teste',media_type:'VIDEO'});
      } else {
        if(u.pathname==='/v2/userinfo') return responder({sub:'usuario-teste',name:'Simulação local'});
        if(u.pathname==='/v2/assets' && metodo==='POST') {
          const p=JSON.parse(opts.body).registerUploadRequest;
          if(p.owner!=='urn:li:person:usuario-teste') throw new Error('Autor inválido.');
          return responder({value:{asset:'urn:li:digitalmediaAsset:asset-teste',uploadMechanism:{'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest':{uploadUrl:'https://upload.invalid/video'}}}});
        }
        if(u.hostname==='upload.invalid' && metodo==='PUT') {
          if(!Buffer.isBuffer(opts.body)||!opts.body.length) throw new Error('Vídeo vazio.');
          return responder({},201);
        }
        if(u.pathname==='/v2/assets/asset-teste') return responder({recipes:[{status:'AVAILABLE'}]});
        if(u.pathname==='/v2/ugcPosts' && metodo==='POST') {
          const p=JSON.parse(opts.body);
          if(p.specificContent['com.linkedin.ugc.ShareContent'].media[0].media!=='urn:li:digitalmediaAsset:asset-teste') throw new Error('Asset de teste inválido.');
          return responder({id:'post-teste'},201,{'x-restli-id':'post-teste'});
        }
      }
      throw new Error(`Requisição inesperada no simulador: ${metodo} ${u.pathname}`);
    },
    salvar(arquivo) {
      const relatorio={modo:'simulacao-local',rede,publicadoNaRede:false,eventos};
      writeFileSync(arquivo,JSON.stringify(relatorio,null,2));return relatorio;
    },
  };
}
