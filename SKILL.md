---
name: flow-reel
description: |
  Cria Reels com o avatar real da pessoa no Google Flow (Omni 1.1 Flash), do
  tema ao Instagram: roteiro, cenas em formato selfie, verificação e retranscrição
  da fala, corte de silêncio e de repetições, fundo original, edição com motions
  no HyperFrames no estilo da própria pessoa, legenda, troca opcional pela voz
  clonada (ElevenLabs), capa e publicação. Na PRIMEIRA vez, pede 4 vídeos de
  referência e extrai fontes, cores e elementos para perfil/estilo.json. Use
  sempre que a pessoa pedir para criar, editar ou publicar um Reel/vídeo com o
  avatar dela; tema e duração variam a cada pedido, nunca são fixos.
---

# Flow Reel: do tema ao Instagram

Pipeline validado em produção. Cada fase tem script em `scripts/`; as armadilhas
já resolvidas estão em `references/armadilhas.md` (ler antes de debugar do zero).

Tudo que é da pessoa (nome, nicho, avatar, cenário, figurino, voz, destino de
publicação, cores, fontes, legenda, layout) vive em **`perfil/perfil.json`** e
**`perfil/estilo.json`**, nunca no código. Chaves de API ficam no `.env.local`
(veja `.env.exemplo`). Este repositório traz só os arquivos `*.exemplo.json`.

Os caminhos abaixo (`scripts/`, `perfil/`, `assets/`) são relativos à pasta do
skill (onde está este arquivo).

## Passo 0: Primeiro uso ou pedido normal?

```bash
node scripts/validar-perfil.mjs
```

A saída é um JSON (`pronto`, `primeiroUso`, `faltando`).

- **`pronto: true`**: vá para "Entender o pedido" (final deste passo).
- **`pronto: false`**: faça o **onboarding** abaixo antes de qualquer Reel. Não
  gere cenas com o estilo de exemplo: o resultado não teria a cara da pessoa.

### Onboarding (só na primeira vez, ou quando `faltando` listar itens)

**Etapa A: pedir 4 vídeos de referência.** Diga à pessoa, em uma mensagem:

> Para o seu Reel sair com a sua cara, preciso de **4 vídeos de referência** de
> edição que você gosta (Reels seus ou de outras contas). Mande 4 caminhos de
> arquivo (ou links, se tiver o `yt-dlp`). Pense em variedade: um com legenda
> marcante, um com painéis/gráficos animados, um com abertura forte e um com
> CTA no final. Se tiver fontes e cores da sua marca, pode mandar também.

Não avance com menos de 4 sem avisar; se ela só tiver 2 ou 3, registre o número
real em `estilo.origem.videosReferencia` e diga que o estilo ficará menos preciso.

**Etapa B: extrair.**

```bash
node scripts/extrair-estilo.mjs ref1.mp4 ref2.mp4 ref3.mp4 ref4.mp4
```

Gera, em `perfil/referencias/refN/`, `folha.jpg` (12 quadros), `abertura.jpg`
(3 primeiros segundos) e `fim.jpg` (CTA), e `perfil/referencias/analise.json` com
duração, cortes por minuto, paleta dominante e cores que se repetem entre os vídeos.

**Etapa C: ler as folhas e preencher o estilo.** Abra com `Read` as 12 imagens
(4 vídeos × folha, abertura, fim) e `analise.json`. O script mede cor e ritmo; o que
ele não enxerga você identifica olhando:

| O que identificar | Onde olhar | Vai para |
|---|---|---|
| Cores de fundo, destaque, texto, alerta | paleta + folhas | `estilo.cores` |
| Família das fontes (título, corpo, legenda) | folhas e legenda | `estilo.fontes` |
| Legenda: palavras por cartela, caixa alta, posição, cor, contorno ou caixa | folhas | `estilo.legenda` |
| Layout: dividido, tela cheia ou pessoa no canto | folhas | `estilo.layout` |
| Elementos gráficos recorrentes (checklists, selos, pílulas, barras, flashes) | folhas | `estilo.elementos` |
| Abertura (rosto direto? título grande?) e CTA | abertura.jpg, fim.jpg | `estilo.layout`, `estilo.elementos` |
| Ritmo | `analise.json` | `estilo.ritmo.cortesPorMinuto` |

Regras:
1. **Fonte não se adivinha pela imagem.** Proponha a mais parecida e **pergunte o
   nome exato e o arquivo** (`.ttf` ou `.otf`, em `perfil/fontes/` ou instalado no
   sistema). Sem arquivo da fonte, a legenda cai em Arial sem avisar (ver armadilhas).
2. **Cor é medida, não chutada.** Use as cores de `analise.json` como base e
   confirme o hex de destaque com a pessoa (a paleta por quantização é aproximada).
3. Se os 4 vídeos divergirem (ex.: 2 com legenda grande, 2 sem), **não faça média**:
   mostre a divergência e peça a escolha.
4. Copie `perfil/estilo.exemplo.json` para `perfil/estilo.json` e preencha. Mantenha
   `origem.videosReferencia` com os 4 nomes e `origem.extraidoEm` com a data.

**Etapa D: confirmar o estilo com a pessoa (obrigatório).** Mostre um resumo de uma
tela (cores com hex, fontes, legenda, layout, elementos, ritmo) e, para ver na
prática, gere a prévia:

```bash
node scripts/aplicar-estilo-template.mjs perfil/previa/index.html
```

Só siga com a aprovação dela. Ajustes pedidos voltam para o `estilo.json`.

**Etapa E: perfil da pessoa.** Copie `perfil/perfil.exemplo.json` para
`perfil/perfil.json` e preencha, perguntando só o que falta:
nome, nicho (uma frase), **nome do avatar no Flow** (padrão "Eu"; ele precisa
existir lá, criado a partir de selfies da pessoa), cenário e figurino fixos,
se troca para voz clonada (ElevenLabs: `voiceIdEnv` e chave no `.env.local`),
fonte das fotos para capas (`perfil/fotos/` ou outro), destinos de publicação e
se há baixa em algum sistema depois de postar (`baixaNoCrm`).

**Etapa F: chaves.** Confira o `.env.local` contra `.env.exemplo` e diga exatamente
quais variáveis faltam para os módulos que a pessoa escolheu. Nunca peça para colar
chaves na conversa; ela edita o arquivo.

Rode `node scripts/validar-perfil.mjs` de novo: precisa dar `pronto: true`.

### Entender o pedido (todo Reel)

- Se a pessoa **mandou o roteiro pronto** (cenas com fala exata), use as falas
  exatamente como vieram e pule para o Passo 2. Não reescreva a fala.
- Se não mandou, pergunte **o tema** e **quanto tempo de vídeo**. O Flow gera
  clipes de até 8s, então `cenas = round(duração / 8)`; avise o arredondamento.
- Releia `perfil/perfil.json` e `perfil/estilo.json` e use esses valores em tudo
  abaixo (cenário, figurino, avatar, cores, fontes, velocidade final).

## Passo 1: Roteiro (só se não veio pronto)

1. Fato, número ou "novidade" no tema: pesquise de verdade (WebSearch). Nunca
   invente dado.
2. Uma fala de 12 a 18 palavras por cena (cabe em 8s). Arco: gancho,
   conteúdo, CTA.
3. CTA com palavra-chave temática e específica, nunca genérica.
4. Sem travessão "—" nem tiques de escrita de IA; no idioma e no tom de
   `perfil.idioma` e `perfil.nicho`.

## Passo 2: Gerar as cenas no Flow

Navegador: `mcp__claude-in-chrome__*` contra `https://flow.google.com/`.

1. **+ Novo projeto**. O projeto abre com um painel de **Agente** à direita:
   feche o painel e **desligue o botão "Agente"** da barra de baixo, senão os
   ajustes de vídeo não aparecem.
2. No chip de ajustes: **Vídeo · Omni 1.1 Flash · 720p · 8s · 9:16 · x1**
   (12 créditos por cena). Confira o saldo no botão da conta (canto superior
   direito) antes: 8 cenas = 96 créditos.
3. **Formato padrão: `perfil.avatar.formato` (selfie)**: braço estendido, câmera
   frontal, do peito para cima, olhando para a lente. Não coloque notebook, tela,
   papel nem **microfone** no prompt: fichas, checklists e números entram depois
   como motion. Modelo de prompt em `references/prompts.md` (usa `perfil.cenario`
   e `perfil.figurino`).
4. Para cada cena (o loop por DOM é mais confiável que screenshot, que trava
   com a janela em segundo plano):
   - clique em `+` ("Adicionar elementos à caixa de comando"), **clique no campo de
     busca**, digite o nome do avatar (`perfil.avatar.nomeNoFlow`), confira que a lista
     mostra só "<nome> / Avatar" e clique em "Incluir no comando" via JS. Confirme que
     a miniatura anexada é o avatar (círculo com o rosto) e não um vídeo recente;
   - insira o prompt via `javascript_tool` + `execCommand('insertText')`
     (digitar pelo teclado corrompe acentos);
   - envie com o botão "Iniciar geração". Pode enfileirar todas as cenas.
5. **Baixar**: passe o mouse no card, clique no `more_vert` dele e, via JS,
   clique em "Fazer o download" → "720p". Os cards ficam do mais novo para o
   mais antigo; a ordem dos arquivos baixados não indica a cena.
6. Organize em `<reel>/` com `raw/` (originais) e `cenaN.mp4`.

## Passo 3: Verificar cada cena

```bash
ffmpeg -y -v error -i cena.mp4 -vn -ac 1 -ar 16000 cena.mp3
node scripts/transcrever-openai.mjs cena.mp3
```

Use a transcrição para **mapear qual arquivo é qual cena** e conferir a fala
palavra por palavra. Palavras que o avatar costuma errar: termos que existem
em inglês ("condições" virou "conditions"). Corrija no prompt: "Pronuncie
todas as palavras em português; a palavra X é em português".

Monte o vídeo base e uma folha de contato (um quadro por cena) para a pessoa
aprovar o visual antes de editar. Se alguma cena mostrar algo indesejado (por
exemplo o celular no quadro da selfie), regere só ela.

```bash
ffmpeg -i cena1.mp4 ... -filter_complex "[0:v][0:a]...concat=n=N:v=1:a=1[v][a]" ... base.mp4
```

## Passo 4: Corte de silêncio e retranscrição (anti-erro)

```bash
node scripts/cortar-silencio.mjs base.mp4 sem_silencio.mp4 0.35 0.12
```

### 4b. Retranscrever o vídeo cortado e caçar defeitos do avatar

A transcrição por cena (Passo 3) **não pega tudo**: o avatar repete palavras ou
trechos no fim da cena ("avisa a hora" duas vezes) e o Whisper por cena engoliu
essas repetições. Depois do corte de silêncio, **sempre** retranscreva o vídeo
inteiro com timestamps e compare com o roteiro, frase por frase:

```bash
ffmpeg -y -v error -i sem_silencio.mp4 -vn -ac 1 -ar 16000 voz16.mp3
node scripts/timestamps-palavras.mjs voz16.mp3 palavras.json
node -e "const p=require('./palavras.json');console.log(p.map(w=>w.texto+' '+w.inicio+'-'+w.fim).join('\n'))"
```

1. Procure: palavra ou frase **repetida**, palavra **trocada** (termo em inglês,
   nome de marca), palavra **faltando**, som sem sentido entre frases.
2. Corte o defeito no vídeo **e** no áudio juntos (`trim`/`atrim` + `concat`,
   `setpts=PTS-STARTPTS`), gerando `limpo.mp4`: da primeira palavra duplicada até
   o início da palavra boa seguinte, com ~0,02 a 0,05s de folga.
3. **Retranscreva o `limpo.mp4`** e confira de novo. Só siga quando o texto bater
   com o roteiro (pontuação e "mas"/"e" no meio não contam). Se um erro não for
   cortável, regere só aquela cena com a correção no prompt.
4. Repita a retranscrição **uma última vez no vídeo final** (Passo 8).

## Passo 5: Fundo: manter o original (padrão)

**Padrão: mantenha o fundo original de cada cena. Não rode remoção de fundo.**
Só use o fundo único abaixo quando a pessoa **pedir** ou quando o pedido trouxer
**um fundo específico no prompt**. O cenário pode variar um pouco entre cenas;
isso é aceito. Para reduzir a variação sem recortar, repita `perfil.cenario` e
`perfil.figurino` em todas as cenas e use a folha de contato para aprovar. Se uma
cena destoar muito, regere só ela. Detalhes pontuais de edição que exijam recortar
parte da imagem são permitidos; apagar o fundo inteiro não.

### Só se pedido: fundo único (cenário igual em todas as cenas)

Cada geração do Flow varia o fundo. Em vez de regerar (créditos), recorte a
pessoa e coloque um fundo fixo atrás:

```bash
npx hyperframes remove-background sem_silencio.mp4 -o pessoa.webm --quality=balanced   # CPU, ~25 min p/ 42s: rodar em segundo plano
ffmpeg -ss 1 -i cena3.mp4 -frames:v 1 ref.jpg
node scripts/gerar-fundo.mjs ref.jpg fundo_a.png        # OpenRouter, ~US$ 0,07
ffmpeg -i fundo_a.png -vf "scale=720:1290,crop=720:1280:0:5" fundo.png
```

Gere 2 opções a partir de quadros diferentes e escolha a mais fiel. O
`pessoa.webm` é VP9 com alpha: decodifique com `-c:v libvpx-vp9` antes do
`-i` para manter a transparência.

## Passo 6: Edição com motions (HyperFrames)

Carregue o skill `/hyperframes` e siga o fluxo `general-video`. O ponto de
partida é o template do **seu estilo**:

```bash
npx hyperframes init "edicao" --non-interactive --example=blank --skill=general-video
node scripts/aplicar-estilo-template.mjs edicao/index.html   # aplica cores e fontes de estilo.json e copia as fontes
# media/: rosto.mp4 (limpo.mp4: cortes feitos, fundo original), audio.wav (voz+sfx)
node scripts/timestamps-palavras.mjs voz16.mp3 palavras.json   # tempos para sincronizar
npx hyperframes check && npx hyperframes snapshot --at <tempos>
npx hyperframes render --output renders/motion.mp4
```

**Layout em camadas (rosto em tela cheia, sem tela dividida):** quando a pessoa pedir "sem tela
dividida" ou "elementos atrás do rosto", use `node scripts/aplicar-estilo-template.mjs edicao/index.html camadas`
(template `assets/edicao-camadas.html`). Camadas, de baixo para cima: vídeo original, fundo preto,
elementos ATRÁS, **pessoa recortada** (`pessoa.webm`, gerado por `npx hyperframes remove-background limpo.mp4
-o pessoa.webm --quality=balanced`, ~10 min para 30s em CPU, rode em segundo plano logo depois do
Passo 4b), elementos NA FRENTE. Os blocos alternam **fundo original** e **fundo preto** a cada virada de
fala. Este é o caso em que o recorte é permitido, porque o pedido exige elementos atrás da pessoa.
Regras aprendidas: textos gigantes atrás ficam **na faixa acima da cabeça** (no centro o rosto os esconde:
"G..K", "R..SO"); texto só com contorno precisa de preenchimento leve (`rgba(destaque,0.10)`) senão o
`check` acusa "text_not_painted"; sobre o fundo original claro, escureça com `#dim` para o verde ter contraste.

Depois de aplicar o template, **reescreva os painéis** com o conteúdo do Reel, mas
respeite `estilo.layout` e `estilo.elementos` (se o estilo não tem checklist, não
use checklist). Se `estilo.layout.tipo` for `tela-cheia` ou `pessoa-no-canto`, adapte
o template (o padrão fornecido é `dividido`).

**Formato do layout dividido (padrão do template):**

- **Painel animado em cima** (`#panel`) e o rosto num **cartão arredondado** embaixo
  (`#card`, raio e borda de `estilo.layout.cartao`). O cartão usa o vídeo direto, com
  o fundo original (`object-position: 50% 36%`).
- **Rosto em tela cheia** (`#card` expande 0,55s) na abertura (`aberturaSegundos`, com
  etiqueta + título), em cada virada de bloco que pede ênfase e no CTA final. Os 3
  primeiros segundos ficam sempre no rosto.
- **Painéis que ilustram a fala palavra por palavra:** cada elemento entra no tempo
  da palavra (`palavras.json`): caixas, checklist com check desenhado, selos,
  cartões de nota. Um painel por bloco de fala, com kicker.
- **Cores e fontes só pelos tokens** do template (`{{DESTAQUE}}`, `{{FUNDO}}`, etc.).
  Alerta e atenção só para o sentido de erro/pendência.
- **Transição entre blocos:** `toSplit()`/`toFull()` animam o cartão; `cut()` dá um
  flash curto; `scene()` entra o painel com subida de 50px.
- **Áudio único** (`audio.wav`): voz + efeitos sintetizados (`gerar-sfx.mjs`, sem
  direitos autorais) abaixando por sidechain quando há fala. Efeitos (`cues.json`)
  nos cortes, pops, checks e alertas. O script não gera trilha de fundo.
- Escalas com o helper `seg()` (fromTo com `immediateRender:false`); `fromTo`
  repetido sem isso quebra a escala em trechos posteriores.
- Valores ilustrativos inventados só se ficarem claramente marcados como
  inventados/fictícios; avise a pessoa.
- Confira as prévias (`snapshot`) antes de renderizar; o render leva alguns
  minutos, rode em segundo plano.

## Passo 7: Voz clonada (módulo opcional, `perfil.voz.trocarVoz`)

Pule se a pessoa não usa voz clonada. **Depois da troca, retranscreva com DOIS transcritores** (`transcrever-openai.mjs` e `timestamps-palavras.mjs`): a troca de voz pode inserir uma palavra (já apareceu "comenta **a** automação") e o Whisper/Groq também inventa palavras sozinho, então só vale como erro real o que o segundo transcritor confirmar. Se for erro real, refaça a troca **só do trecho** (poucos créditos), emende com `acrossfade` de 25ms e retranscreva. **Faça este passo ANTES do Passo 6**, sobre o
`limpo.mp4` (sem repetições): os tempos de `palavras.json` vêm da voz final e os
motions ficam sincronizados; a troca de voz preserva o tempo da fala.

```bash
ffmpeg -i limpo.mp4 -vn -ac 1 -ar 44100 -acodec pcm_s16le voz.wav
node scripts/trocar-voz-elevenlabs.mjs voz.wav voz_eleven.mp3     # usa stability/similarity de perfil.voz
ffmpeg -y -v error -i voz_eleven.mp3 -ac 1 -ar 16000 voz16.mp3
node scripts/timestamps-palavras.mjs voz16.mp3 palavras.json      # retranscrever a voz trocada
```

Monte o `audio.wav` (`gerar-sfx.mjs cues.json voz.wav audio.wav`, com a voz trocada
em WAV) e siga para o Passo 6.

- Padrão validado: **similarity 1.0, stability 0.35**, remoção de ruído ligada.
  Mantém o tempo da fala (boca sincronizada). ~705 créditos para 42s.
- A troca de voz **copia defeitos do áudio do avatar** (sons sem sentido, palavras
  repetidas). Se a retranscrição achar algum que escapou do Passo 4b, ache o ponto
  com `silencedetect` + transcrição de pedaços curtos, corte vídeo e áudio juntos e
  refaça a troca.
- **Alternativa quando a troca de voz soa grave/pausada (`scripts/gerar-voz-tts.mjs`):** gera a fala do
  zero com `eleven_v4` (texto para voz, sua voz clonada), frase por frase, e encaixa cada frase na janela
  de tempo do avatar (`frases.json` com `inicio`/`fim` tirados de `palavras.json`). O ritmo e o timbre vêm
  do clone, não do Flow. A boca só bate no começo e no fim de cada frase. O script **confere cada frase por
  transcrição** e regera até 3 vezes; ainda assim confira o áudio final com 2 transcritores e, se algum
  artigo curto sumir ("sendo o humano" virou "sendo humano"), refaça só aquela frase.
- Ajuste fino sem gastar crédito: `rubberband=tempo=1.2:pitch=1.0595:formant=shifted` (+1 semitom) no áudio
  final, no lugar de `atempo`, deixa a voz menos grave mantendo o ritmo.

## Passo 8: Montagem final (velocidade em `perfil.velocidadeFinal`, padrão 1,1x)

Todo Reel sai acelerado em `velocidadeFinal` (padrão 1,1x) para ficar mais
dinâmico. Aplique em vídeo e áudio juntos, no final:

1. Legenda (de `estilo.legenda` e `estilo.fontes.legenda`):
   ```bash
   node scripts/timestamps-palavras.mjs voz16.mp3 palavras.json
   # remova alucinações do Whisper (ex.: "Seventy-A") antes de gerar
   node scripts/gerar-legenda.mjs palavras.json legenda.ass
   node scripts/verificar-legenda.mjs legenda.ass video.mp4      # 0 sobreposições, 0 passando do fim
   ```
2. Queime a legenda e acelere tudo de uma vez (a legenda é queimada **antes**
   do `setpts`, então os tempos do `.ass` valem para o vídeo de 1,0x). `fonts` é a
   pasta com o arquivo da fonte da legenda:
   ```bash
   ffmpeg -i renders/motion.mp4 -vf "subtitles=legenda.ass:fontsdir=edicao/fonts,setpts=PTS/1.1" -af "atempo=1.1" -r 30 -c:v libx264 -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart final.mp4
   ```
   Duração final = duração original / velocidade.
3. Verifique o arquivo final: **retranscreva o `final.mp4` e compare com o roteiro
   frase por frase** (nenhuma repetição, troca ou palavra faltando; ver Passo 4b) e
   confira pacotes de áudio sem salto > 0,1s (`ffprobe -show_entries packet=pts_time`).
   Se achar erro, volte ao Passo 4b em vez de publicar.

Se o áudio for mixado fora do HyperFrames, `gerar-sfx.mjs cues.json voz.wav mix.wav 1.1`
já aplica o `atempo` no mix; nesse caso acelere só o vídeo.

## Passo 9: Capa e legenda do post

1. Escolha uma foto real da pessoa (`perfil.fotos`: pasta local ou outra fonte),
   **diferente da capa anterior** e combinando com o tema.
2. `L1=".." L2=".." L3=".." SUB=".." node scripts/gerar-capa.mjs foto.jpg capa.jpg`
   (linhas brancas ≤ 16 caracteres, linha de destaque ≤ 14; cores e fontes de
   `estilo.json`). Simule os recortes 4:5 e 1:1 do grid do perfil antes de aprovar.
3. Legenda: gancho na primeira linha, problema, passo a passo, frase de marca,
   CTA igual ao do vídeo, ~15 hashtags. Sem travessão.

## Passo 10: Publicar (módulo opcional; só com ordem explícita)

Publicar é público: só quando a pessoa mandar ("poste agora", "programe para…").
Siga `perfil.publicacao`.

- **Agora → API do Instagram** (capa e legenda vão juntas):
  ```bash
  node scripts/upload-supabase.mjs final.mp4 reels/x.mp4 video/mp4 post-videos
  node scripts/upload-supabase.mjs capa.jpg reels/capa-x.jpg image/jpeg post-images
  node scripts/publicar-instagram.mjs <video_url> <capa_url> legenda.txt
  ```
  (O upload só hospeda o arquivo com URL pública para a API do Instagram; use qualquer
  bucket público equivalente se não tiver Supabase.)
- **Programar → Meta Business Suite** pelo Chrome (detalhes e armadilhas em
  `references/armadilhas.md`): só Instagram, legenda colada via evento de colar,
  conferir em Programados.
- Horário: use o melhor horário medido do perfil da própria pessoa; sem dado, 11h ou 21h.
- **Baixa depois de postar:** se `perfil.baixaNoCrm.ativo`, dê baixa no item de
  planejamento onde o roteiro nasceu (veja `perfil.baixaNoCrm.descricao`) e confirme
  no sistema. Não crie registros paralelos.

### LinkedIn (quando a pessoa pedir; `perfil.publicacao.linkedin`)

O vídeo vai como post nativo, **9:16 mesmo** (o feed mostra menor, com faixas
laterais). O texto é reescrito para o tom do LinkedIn, não copiado do Instagram:
gancho curto, primeira pessoa, problema, passo a passo, pergunta final, **3 a 5
hashtags**, sem travessão.

```bash
node scripts/publicar-linkedin-video.mjs final.mp4 texto_linkedin.txt "Título curto"
```

Precisa de `LINKEDIN_ACCESS_TOKEN` no `.env.local` (token vale ~60 dias). O LinkedIn
não tem agendamento por essa API: publica na hora.

## Referências

- `perfil/perfil.exemplo.json` e `perfil/estilo.exemplo.json`: formato dos perfis.
- `references/armadilhas.md`: tudo que já quebrou e como resolver.
- `references/prompts.md`: modelo de prompt selfie e de consistência.
- `references/design-system.md`: como cores, fontes e capa entram no estilo.
- `assets/edicao-template.html`: composição HyperFrames com tokens de estilo.
