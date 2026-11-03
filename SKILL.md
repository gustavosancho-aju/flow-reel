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
  avatar dela ou editar um vídeo já gravado (visita a imóvel, depoimento etc.).
  Vídeo gravado pula a geração no Flow; aceita 9:16 e 16:9.
  Tema e duração variam a cada pedido, nunca são fixos.
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

Antes de começar num clone novo, rode `npm run diagnostico` (Node.js 22+ e
FFmpeg/ffprobe com drawtext, libass/subtitles, libx264 e AAC). Não procure arquivos
nem credenciais em pastas de outro projeto ou na máquina do autor.

A configuração pode ser criada com `npm run configurar`. Se a pessoa escolher
explicitamente `--estilo-basico`, use o estilo incluído, registrado em
`origem.aprovadoSemReferencias`; não alegue que ele foi extraído de referências.
As fontes redistribuíveis vêm em `assets/fonts/`, com licenças OFL. Caminhos de fonte
relativos em `estilo.json` são resolvidos a partir da raiz do clone.
O preset básico permite começar; a extração com 4 referências continua sendo o
fluxo de personalização. O configurador não sobrescreve perfil, estilo ou chaves.

Para uma primeira exportação sem APIs, use
`npm run editar -- bruto.mp4 videos/primeira-edicao "9:16"` (ou `"16:9"`). Esse
comando exporta vídeo/capa e prepara o template, sem renderizar os motions de exemplo.
Silêncio só é cortado com `--cortar-silencio`; legendas só são queimadas ao fornecer
`--palavras palavras.json` com os tempos do vídeo limpo. A voz permanece original,
publicação é opcional e cada pessoa configura as próprias contas. Para verificar a
instalação sem mídia pessoal nem chaves, use `npm run exemplo` após configurar.


Identifique o modo antes da validação: **avatar** (padrão atual) ou **gravado**
(a pessoa fornece um vídeo bruto). No gravado, use `node scripts/validar-perfil.mjs gravado`:
nome e nicho continuam necessários; avatar, cenário e figurino do Flow não são exigidos.
Faça o mesmo onboarding de estilo, mas pule as perguntas sobre o Flow e não ative
troca de voz automaticamente. Não precisa de conta, créditos ou extensão do Flow.

```bash
node scripts/validar-perfil.mjs
```

A saída é um JSON (`pronto`, `primeiroUso`, `faltando`).

- **`pronto: true`**: vá para "Entender o pedido" (final deste passo).
- **`pronto: false`**: faça o **onboarding** abaixo antes de qualquer Reel. Não
  gere cenas com o estilo de exemplo: o resultado não teria a cara da pessoa.

### Onboarding (só na primeira vez, ou quando `faltando` listar itens)

**Etapa A: pedir 4 vídeos de referência.** Se a pessoa quiser usar Reels que ela mesma
já publicou, dá para baixar pela API do Instagram (`GET /{media-id}?fields=media_url`);
Reels com música da biblioteca do Instagram vêm **sem `media_url`**, então escolha outros.
Diga à pessoa, em uma mensagem:

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
   sistema). Para começar, ofereça as fontes incluídas. Para uma fonte personalizada,
   confirme o arquivo e seu caminho (relativo ao clone ou absoluto).
2. **Cor é medida, não chutada.** Use as cores de `analise.json` como base e
   confirme o hex de destaque com a pessoa (a paleta por quantização é aproximada).
3. Se os 4 vídeos divergirem (ex.: 2 com legenda grande, 2 sem), **não faça média**:
   mostre a divergência e peça a escolha.
4. Copie `perfil/estilo.exemplo.json` para `perfil/estilo.json` e preencha. Mantenha
   `origem.videosReferencia` com os 4 nomes e `origem.extraidoEm` com a data.

**Etapa D: confirmar o estilo com a pessoa (obrigatório).** Gere a cartela de estilo
(funciona sem nenhum vídeo: cores com hex, título, pílulas, cartão, amostra de legenda,
layout, ritmo e elementos) e mande a imagem para ela:

```bash
node scripts/cartela-estilo.mjs perfil/cartela.png
```

Leia a cartela antes de mandar (texto cortado, fonte errada caindo em Arial). Só siga
com a aprovação dela; ajustes voltam para o `estilo.json` e a cartela é refeita. A
prévia animada do template (`aplicar-estilo-template.mjs`) só faz sentido no primeiro
Reel, quando já existe vídeo para pôr nela.

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

- Se recebeu **vídeo gravado**, siga a entrada alternativa abaixo; pule os Passos 1 e 2.
- Se a pessoa **mandou o roteiro pronto** (cenas com fala exata), use as falas
  exatamente como vieram e pule para o Passo 2. Não reescreva a fala.
- Se não mandou, pergunte **o tema** e **quanto tempo de vídeo**. O Flow gera
  clipes de até 8s, então `cenas = round(duração / 8)`; avise o arredondamento.
- Releia `perfil/perfil.json` e `perfil/estilo.json` e use esses valores em tudo
  abaixo (cenário, figurino, avatar, cores, fontes, velocidade final).

### Entrada alternativa: vídeo gravado (9:16 ou 16:9)

Receba o caminho do bruto e o formato de saída desejado. Sem formato explícito,
o script infere a orientação, incluindo a rotação de vídeos de celular:

```bash
node scripts/preparar-video-gravado.mjs visita.mp4 visita-editada "16:9"
node scripts/transcrever-openai.mjs visita-editada/voz16.mp3
```

O script preserva o arquivo original e gera `base.mp4`, `voz16.mp3` e `projeto.json`
na pasta nova. Usa faixas quando necessário, sem recortar ou distorcer. Exige áudio.
O manifesto registra `modo`, `formato`, dimensões e `velocidadeFinal: 1`; ele serve
de referência para os comandos seguintes (não é carregado automaticamente).

Entre no **Passo 3** para conferir a transcrição e o visual do bruto. Não há cenas
para gerar ou comparar com roteiro: use a fala original como referência e identifique
repetições/tentativas de fala para cortar no Passo 4b. Não reescreva um depoimento.
Trechos de visita sem fala podem ser importantes: preserve-os quando fizerem parte
da demonstração, em vez de aplicar corte de silêncio indiscriminadamente.

Depois, reaproveite os Passos 4 a 10. No gravado, mantenha cenário e voz originais,
com velocidade **1x** por padrão; troca de voz e aceleração só quando solicitadas.
Use o mesmo formato em toda a cadeia:

```bash
node scripts/aplicar-estilo-template.mjs edicao/index.html "16:9" gravado
node scripts/gerar-legenda.mjs palavras.json legenda.ass "16:9"
node scripts/gerar-capa.mjs foto.jpg capa.jpg "16:9"
```

Use `"9:16"` para vertical. O template gravado mantém a imagem inteira e desativa
os zooms do exemplo. Em 16:9, painel e vídeo ficam lado a lado. Como no avatar,
reescreva os painéis e seus tempos, duração da composição e dos clipes para a fala
final (o exemplo contém 29,35s). Reextraia `voz16.mp3` do vídeo limpo antes de gerar
timestamps e legenda. A capa pode usar um quadro representativo do imóvel/depoimento.
Na montagem, use `setpts=PTS/1` e `atempo=1`, salvo velocidade pedida.
Para publicar horizontal, use o destino/formato solicitado; para um Reel vertical,
prepare uma versão 9:16 e confira o enquadramento. O script do Instagram continua
publicando Reels; o do LinkedIn recebe o arquivo no formato escolhido.

## Passo 1: Roteiro (só se não veio pronto; modo avatar)

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

O comando acima continua disponível. Para selecionar o motor explicitamente:

```bash
node scripts/cortar-video.mjs base.mp4 sem_silencio.mp4 ffmpeg 0.35 0.12
node scripts/cortar-video.mjs base.mp4 sem_silencio.mp4 auto-editor 0.35 0.12 0.025
```

O padrão de `cortar-video.mjs` é `ffmpeg`. O motor `auto-editor` usa a CLI 31.x,
instalada pelo [binário oficial](https://auto-editor.com/installing), no PATH ou
em `AUTO_EDITOR_PATH` (caminho do executável, sem argumentos). Não depende de pip.
Parâmetros finais: duração mínima do silêncio, margem de respiro e limiar de áudio
(fração de 0 a 1, exclusivo em 0; só auto-editor). Os motores têm detectores
diferentes: ouça os cortes e ajuste o limiar/margem. Ambos cortam áudio e vídeo juntos
e preservam as dimensões. Se faltar auto-editor, o comando informa como usar FFmpeg;
não troca de motor silenciosamente. Nenhum motor remove repetições de fala sozinho:
o Passo 4b continua obrigatório. No gravado, preserve cenas relevantes sem fala.

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
3. **Retranscreva o `limpo.mp4`** e confira de novo. No avatar, só siga quando o texto
   bater com o roteiro (pontuação e "mas"/"e" no meio não contam); se um erro não
   for cortável, regere a cena. No gravado, compare com a fala original e os cortes
   aprovados: remova repetições sem mudar o sentido; peça nova gravação se necessário.
4. Repita a retranscrição **uma última vez no vídeo final** (Passo 8).

### 4c. Frases com tempo (base da voz e da conferência)

Esta etapa é do modo **avatar**. No **gravado**, mantenha a transcrição conferida
do vídeo limpo como referência para motions e legenda e pule a geração de voz.

Salve as falas exatas do roteiro em `roteiro.txt` (uma cena por linha) e alinhe com
os tempos da transcrição do `limpo.mp4`:

```bash
node scripts/frases.mjs roteiro.txt palavras.json frases.json
```

O texto de cada frase vem do **roteiro** (não da transcrição, que escreve "R$ 150"
onde se falou "cento e cinquenta reais" e "Grock" onde é "Grok"); da transcrição só
vêm os tempos. Frases marcadas `(estimada)` não tiveram nenhuma palavra reconhecida:
confira a janela delas.

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

## Passo 7: Voz (padrão: fala por texto com sincronia labial por palavra)

No modo **gravado**, pule este passo e mantenha a voz original. Só gere ou troque
a voz quando a pessoa pedir explicitamente; o método de voz do perfil do avatar
não se aplica automaticamente a depoimentos e visitas gravadas.

**Faça este passo ANTES do Passo 6**, sobre o `limpo.mp4`: os tempos da voz final guiam
os motions e a legenda.

**Padrão: fala por texto.** O clone lê o roteiro (voz natural, no ritmo da pessoa, sem a
gravidade da voz do Flow) e cada palavra é encaixada no instante em que o avatar mexe a
boca para ela (`lib/sincronia.mjs`). Requisitos: `frases.json` gerado pelo `frases.mjs`
(traz o tempo de cada palavra do avatar) e `GROQ_API_KEY` (tempo das palavras da voz nova).
No Reel do Grok, o desvio médio entre a palavra falada e a boca caiu de 120ms (frase
esticada inteira) para 33ms. Sem esses requisitos, cai no encaixe por frase (a boca bate
só no começo e no fim). A troca de voz e a voz do Flow continuam disponíveis no A/B.

```bash
node scripts/gerar-voz.mjs limpo.mp4 frases.json voz.wav
```

O relatório (`voz-trabalho/texto.relatorio.json` e a saída do comando) mostra, por frase,
o modo (palavra ou frase), as âncoras e o desvio antes e depois. Frases que só caberiam
deformando a fala (comprimir/esticar fora de 0,8 a 1,35x) caem no encaixe por frase de
propósito: é melhor a boca levemente fora do que a palavra embolada.

**Só se a pessoa não gostar da voz** (ou quiser comparar), rode o teste A/B uma vez:

```bash
node scripts/escolher-voz.mjs amostras limpo.mp4 frases.json      # ~6s do começo do Reel
```

Ele monta `amostras-voz/comparacao.mp4`: o mesmo trecho tocando cada opção em sequência,
com etiqueta na tela e já na velocidade final do perfil. Cada opção é conferida por
transcrição. Custo típico: ~120 créditos (B) + ~100 (C); A e as variações de tom são grátis.

| Opção | O que é | Quando costuma ganhar |
|---|---|---|
| A | voz do Flow, sem troca | quando o clone não convence |
| B / B+1 | troca de voz: o clone sobre a fala do avatar | boca mais sincronizada; herda ritmo e gravidade do avatar |
| C / C+1 | fala por texto (padrão): o clone lendo o roteiro | voz mais natural e no ritmo da pessoa; sincronia por palavra |

Mande o `comparacao.mp4` para a pessoa e grave a escolha dela (pode pedir +2, +3...);
dali em diante o `gerar-voz.mjs` usa o método gravado:

```bash
node scripts/escolher-voz.mjs gravar C+1
```

O `gerar-voz.mjs` aplica o método e o ajuste de tom do perfil e **confere frase a frase com dois
transcritores** (`lib/conferir.mjs`: "ok", "aviso" = só um transcritor discordou,
provavelmente erro dele; "erro" = os dois ouvem diferente do roteiro). Sai com código 3
se houver erro, listando as frases.

- **Erro na fala por texto (C):** a voz engole artigos curtos ("sendo o humano" virou
  "sendo humano"). Mude o texto daquela frase no `frases.json` (uma vírgula antes da
  palavra engolida resolveu: "sendo, o humano") e rode de novo: só ela é regerada, o
  resto vem do cache (`voz-trabalho/texto.frases/`). Ou force com
  `node scripts/gerar-voz-tts.mjs frases.json voz-trabalho/texto.wav <duração> --refazer 11`.
  O cache separa a fala gerada (custa crédito) do encaixe (grátis): mudar só a janela ou a
  sincronia reencaixa as falas já aprovadas sem chamar o ElevenLabs.
- **Na faixa montada, confira com a janela exata da frase.** A conferência isolada de cada
  frase não vê problemas de montagem (foi assim que um trecho sobreposto virou "tung
  direito"); o `gerar-voz.mjs` confere na faixa final por isso.
- **Erro na troca de voz (B):** a troca copia defeitos do avatar e às vezes insere
  palavra ("comenta **a** automação"). Corte o defeito no `limpo.mp4` (Passo 4b) ou refaça
  a troca só do trecho e emende com `acrossfade` de 25ms.
- Depois: `ffmpeg -i voz.wav -ac 1 -ar 16000 voz16.mp3`, `timestamps-palavras.mjs` para
  os tempos finais e `gerar-sfx.mjs cues.json voz.wav audio.wav` para o áudio da edição.
- Ajustes finos ficam no perfil: `voz.stability`/`voz.similarity` (troca, padrão 0,35/1,0),
  `voz.texto` (fala por texto: `modelo`, `stability`, `similarity`, `style`, `speed`;
  padrão eleven_v4, 0,5, 0,9, 0,2, 1,1) e `voz.ajusteSemitons`.

## Passo 8: Montagem final (velocidade em `perfil.velocidadeFinal`, padrão 1,1x)

No avatar, o Reel sai acelerado em `velocidadeFinal` (padrão 1,1x).
No gravado, mantenha 1x salvo pedido explícito. Aplique a velocidade escolhida
em vídeo e áudio juntos, no final:

1. Legenda (de `estilo.legenda` e `estilo.fontes.legenda`). No **gravado**, use
   `palavras.json` da transcrição conferida do vídeo limpo diretamente em
   `gerar-legenda.mjs palavras.json legenda.ass "9:16"` (ou `"16:9"`): não há roteiro
   para substituir a fala. No **avatar**, o texto vem do **roteiro** e só
   os tempos vêm da voz final, então não é preciso remendar o que o transcritor escreveu
   ("Grock", "R$ 150,00", um "a" inventado, um "os" engolido). Escreva no `roteiro.txt` do
   jeito que quer ler na tela (ex.: "R$150"):
   ```bash
   node scripts/timestamps-palavras.mjs voz16.mp3 palavras_voz.json
   node scripts/palavras-legenda.mjs roteiro.txt palavras_voz.json palavras_legenda.json
   node scripts/gerar-legenda.mjs palavras_legenda.json legenda.ass
   node scripts/verificar-legenda.mjs legenda.ass video.mp4      # 0 sobreposições, 0 passando do fim
   ```
2. Queime a legenda e acelere tudo de uma vez (a legenda é queimada **antes**
   do `setpts`, então os tempos do `.ass` valem para o vídeo de 1,0x). `fonts` é a
   pasta com o arquivo da fonte da legenda. Troque `1.1` por `perfil.velocidadeFinal`:
   ```bash
   ffmpeg -i renders/motion.mp4 -vf "subtitles=legenda.ass:fontsdir=edicao/fonts,setpts=PTS/1.1" -af "atempo=1.1" -r 30 -c:v libx264 -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart final.mp4
   ```
   Duração final = duração original / velocidade. O ajuste de tom já vem no `voz.wav`
   (Passo 7); aqui é só velocidade.
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
  node scripts/upload-supabase.mjs final.mp4 reels/x-unico.mp4 video/mp4
  node scripts/upload-supabase.mjs capa.jpg reels/capa-x-unica.jpg image/jpeg
  node scripts/publicar-instagram.mjs <video_url> <capa_url> legenda.txt
  ```
  O upload usa um bucket privado dedicado e imprime a URL assinada temporária.
  Configure `references/supabase-storage.sql`, a chave publishable e o refresh token
  inicial do usuário dedicado limitado por RLS (veja `.env.exemplo`). A sessão é
  renovada antes do upload; o refresh token rotacionado fica em `.supabase-session.json`,
  fora do Git. Nomes de destino devem
  ser únicos: não há sobrescrita. A URL deve continuar válida até a API terminar
  de baixar/processar vídeo e capa; gere-a perto da publicação, não ao agendar.
  Nunca use chave administrativa. Expirar a URL não remove o arquivo do bucket;
  a limpeza posterior cabe ao administrador.
- **Programar → Meta Business Suite** pelo Chrome (detalhes e armadilhas em
  `references/armadilhas.md`): só Instagram, legenda colada via evento de colar,
  conferir em Programados.
- Horário: use o melhor horário medido do perfil da própria pessoa; sem dado, 11h ou 21h.
- **Baixa depois de postar:** se `perfil.baixaNoCrm.ativo`, dê baixa no item de
  planejamento onde o roteiro nasceu (veja `perfil.baixaNoCrm.descricao`) e confirme
  no sistema. Não crie registros paralelos.

### LinkedIn (quando a pessoa pedir; `perfil.publicacao.linkedin`)

O vídeo vai como post nativo, no formato escolhido (9:16 ou 16:9).
O texto é reescrito para o tom do LinkedIn, não copiado do Instagram:
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
