# Armadilhas já resolvidas — Flow Reel

Cada item aqui custou uma rodada real de geração ou publicação para
descobrir. Ler antes de debugar do zero.

## Google Flow

- **Digitar acentos pelo teclado simulado (`computer.type`) corrompe a
  acentuação** ("automacao" em vez de "automação"). Sempre inserir o texto do
  prompt via `javascript_tool`, escrevendo direto no `contenteditable` com
  `document.execCommand('insertText', ...)`.
- **O avatar precisa ser re-anexado antes de cada cena** — anexar uma vez não
  persiste para a próxima mensagem do chat, mesmo na mesma sessão.
- **A sessão de Agente pode herdar "sempre aprovar" de créditos** de um
  projeto anterior — se o card de confirmação não aparecer depois de enviar
  o prompt, não é erro, a geração já está rodando.
- **Sem repetir o figurino no prompt, o Flow troca a roupa a cada cena nova**,
  mesmo mantendo a identidade do avatar. Repetir literalmente "a mesma
  camiseta/roupa da cena anterior" a partir da 2ª cena resolve.
- **"Claude" é pronunciado como a palavra inglesa "cloud" em português.**
  Testado e falhou: instrução de pronúncia fonética no prompt ("clóde, rima
  com lorde"), grafia alternativa "Claudi" (2 sílabas), grafia "Claudi" com
  regra explícita de não reduzir a 1 sílaba — nenhuma corrigiu. Se a marca não
  for o tema central do vídeo, evitar citá-la na fala; se for essencial,
  aceitar o áudio e corrigir só a legenda (mapa `CLOUD → CLAUDE`).
- **Carro em movimento com alguém falando pra câmera**: colocar a pessoa no
  banco do **passageiro**, nunca dirigindo — evita sugerir direção distraída.
- **(out/2026) Projeto novo abre em modo Agente.** O painel lateral do agente
  e o botão "Agente" ligado escondem o chip de ajustes de vídeo. Feche o
  painel e clique em "Agente" para desligar; aí aparece "Vídeo · 720p · 8s…".
- **O padrão do chip veio 16:9 e 10s (15 créditos).** Sempre conferir e trocar
  para 9:16 e 8s (12 créditos) antes da primeira cena.
- **Screenshot do Chrome trava** (`Page.captureScreenshot timed out`) quando
  a janela fica atrás de outra. Não dependa de coordenadas: dirija o Flow pelo
  DOM (`find` para refs, `javascript_tool` para clicar em
  `[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Incluir no comando')`).
- **Download pelo menu do card:** o botão `more_vert` do card só existe no DOM
  durante o hover. Faça `hover` no card, ache o `more_vert` mais próximo pelo
  `getBoundingClientRect`, clique, e então clique via JS nos `[role=menuitem]`
  "Fazer o download" e "720p". O último card da fileira às vezes precisa de
  mais espera.
- **O fundo varia entre cenas** mesmo descrito igual no prompt (quadros mudam
  de lugar, prateleira com/sem LED, parede diferente). Não tente consertar
  regerando: recorte a pessoa e use um fundo único (`gerar-fundo.mjs`).
- **Termos que existem em inglês saem em inglês** ("condições" → "conditions").
  Reforçar no prompt que a palavra é em português resolveu na regeração.
- **Texto pedido para aparecer na tela sai em inglês** ("Property checklist").
  Texto legível vai no motion, nunca no vídeo gerado.
- **Créditos:** 72 créditos davam só 6 cenas; a Flow mostra um aviso
  "créditos acabando". Confira o saldo no botão da conta antes de gerar.

## ffmpeg / filtros

- **Vírgula dentro de uma expressão (`if(lt(t,0.2),...)`) é lida como
  separador de filtro** pelo ffmpeg e quebra o filtergraph inteiro. Precisa
  escapar como `\,`. Mas escrever a barra invertida dentro de uma string
  JS/heredoc frequentemente é comida por camadas de quoting (shell → heredoc →
  JS). Solução robusta: montar o caractere com `String.fromCharCode(92)` em
  vez de escrever `"\\,"` no código-fonte.
- **`fontfile=C:/Windows/Fonts/...` quebra o parser do `drawtext`** por causa
  do `:` no caminho — mesmo escapado. Copiar a fonte para a pasta de saída e
  rodar o `ffmpeg` com `cwd` nela, referenciando só o nome do arquivo
  (`fontfile=fonte.ttf`).
- **Em `drawbox`, `w`/`h` são as dimensões DA CAIXA, não do quadro** — usar
  `iw`/`ih` para referenciar a largura/altura do vídeo. Confundir os dois joga
  o elemento para o canto superior esquerdo.
- **`drawbox` resolve a posição uma única vez, na configuração do filtro — não
  anima por frame.** Para uma varredura/transição animada, usar `overlay` com
  uma expressão em `x=`/`y=` (esse sim é reavaliado a cada frame).
- **Conferir um frame com `-ss` ANTES do `-i` zera os timestamps do vídeo**,
  o que faz filtros dependentes de tempo (`subtitles`, `overlay=enable=between(...)`)
  parecerem quebrados quando na verdade só receberam o tempo errado. Sempre
  usar `-ss` DEPOIS do `-i` (ou depois do `-vf`) para extrair pelo tempo real
  do arquivo de saída.
- **`silencedetect` escreve o relatório em STDERR mesmo quando o ffmpeg
  termina com código de sucesso** — `execFileSync` só devolve `stdout`, então
  a detecção volta vazia sem erro nenhum. Usar `spawnSync` e ler `stderr`.

## Transcrição (Whisper / Groq / OpenAI)

- **Whisper alucina em trechos de silêncio no fim do áudio**, inventando
  créditos de legendagem em português ("Legenda: Fulano", "Legenda por
  Sônia...") com timestamp **além da duração real** do arquivo. Sempre
  descartar toda palavra cujo `inicio >= duração_real_do_arquivo - 0.05`.
- **Nunca reordenar palavras transcritas por timestamp** ao montar legenda a
  partir de um vídeo concatenado de várias cenas — nas emendas entre cenas os
  tempos podem se cruzar, e ordenar troca a ordem real da fala ("QUE VOCÊ
  ESTÁ" / "NÃO VENDO" em vez de "QUE VOCÊ ESTÁ VENDO"). Preservar a ordem que
  o Whisper devolveu; só empurrar o tempo pra frente se dois tokens se
  sobrepuserem (`inicio = max(inicio, fim_anterior)`), nunca reclassificar a
  ordem.
- Comparar sempre **com e sem pista de vocabulário** (`prompt` na chamada) —
  a versão sem pista revela como o modelo realmente ouviu (útil pra detectar
  mispronúncia real, tipo "cloud" em vez de "Claude"); a versão com pista
  mostra a melhor leitura possível do texto esperado.

## Legenda dinâmica (.ass)

- **Cartela que estende o fim em X segundos pode invadir a cartela seguinte**
  se a pausa entre elas for curta (comum depois de cortar silêncio) — duas
  aparecem empilhadas na tela por alguns quadros. Sempre limitar o fim da
  cartela ao início da próxima menos uma margem pequena (`~0.02s`).
- **Com o silêncio cortado, pausas entre frases encurtam** e uma cartela pode
  juntar o fim de uma frase com o começo da outra ("VOCÊ ESTÁ NÃO" em vez de
  duas cartelas separadas). Quebrar a cartela também na pontuação do fim da
  palavra anterior, não só por tamanho/pausa.
- **`WrapStyle: 0` (quebra automática) é necessário** se o corpo da fonte for
  grande o bastante para cartelas longas passarem de 720px — sem isso a
  cartela sai da tela em vez de quebrar em duas linhas.
- **Para confirmar objetivamente que nada encosta na borda** (sem ficar
  adivinhando por olho): renderizar só a legenda sobre fundo preto e medir o
  brilho máximo (`signalstats` + `metadata=print:key=lavfi.signalstats.YMAX`)
  numa faixa de 24px de cada lado, ao longo do vídeo inteiro (não só um
  frame). Bordas em preto puro (`YMAX baixo`) e centro alto prova que a
  legenda nunca vaza.

## Motion graphics sincronizado com a fala

- **Inserir motion como CORTE (pausando a fala) soa como falha de áudio**,
  não como ênfase. Preferir sempre **overlay por cima do vídeo**, com o áudio
  original correndo por baixo: gerar a peça sem trilha própria (`-an`),
  deslocá-la no tempo com `setpts=PTS-STARTPTS+INICIO/TB` e aplicar com
  `overlay=enable='between(t,inicio,fim)'`, mapeando `-map 0:a` (o áudio da
  base, não da peça).
- Se optar por corte mesmo assim, um insert **mudo** no meio da fala soa como
  erro — sintetizar um som curto para a peça (`aevalsrc` com uma senoide grave
  caindo de tom funciona bem como "impacto"), calibrado contra o volume médio
  da fala (`volumedetect`) para não estourar nem ficar inaudível.
- **A legenda deve ser suprimida nos trechos cobertos por motion de tela
  cheia** (variável `SUPRIMIR` em `gerar-legenda.mjs`) — a peça já mostra o
  texto, repetir embaixo duplica a mensagem na tela.

## ElevenLabs Voice Changer (via MCP `creative_*`)

- O node `voice-changer` (`model_id: eleven_multilingual_sts_v2`) **rejeita
  `voice_id` passado direto em `creative_generate_in_flow`** — esse parâmetro
  só é aceito para node `tts`. Para `voice-changer`: gerar o node primeiro
  (falha com "Select a voice, or pick one on the connected Voice node."),
  depois `creative_update_node(node_id, voice_id=...)`, e só então
  `creative_run_flow_nodes`.
- **Achar a voz certa por `creative_list_voices(search="seu nome")`** pode
  devolver várias vozes de terceiros com nome parecido — confirmar contra
  `ELEVENLABS_VOICE_ID` do `.env.local` (a mesma usada na resposta automática
  de áudio do WhatsApp) comparando os IDs sem nunca imprimir o valor bruto do
  secret.
- **A troca de voz custa créditos reais** — o preço vem em
  `price.credits`/`price.price_cents` na resposta do
  `creative_get_flow_run_status`; sempre informar o custo real à pessoa.
- Upload de asset pro workspace da ElevenLabs é por presigned URL:
  `creative_create_asset_upload` → `PUT` manual dos bytes (nunca passar o
  arquivo pela conversa) → `creative_finalize_asset_upload`.

## Supabase Storage / Instagram Graph API

- **O bucket `post-images` só aceita `image/png|jpeg|webp`** — vídeo tem que
  ir para `post-videos` (`video/mp4|quicktime`). Confirmar as duas URLs
  públicas respondem 200 antes de criar o container do Reel; um link que não
  carrega quebra a criação silenciosamente (erro genérico da Graph API).
- **O `publishReels` de referência costuma esperar 10s fixos** antes de
  publicar — no fluxo real o processamento levou até 25s. Sempre fazer
  polling do `status_code` do container até `FINISHED`, nunca um `sleep`
  fixo.
- **O grid do perfil recorta o Reel em 4:5 a partir do centro** para montar a
  miniatura — qualquer capa 9:16 tem que sobreviver a esse recorte central e
  também ao recorte 1:1; simular com `ffmpeg -vf crop=...` antes de aprovar.

## Recorte da pessoa e fundo único

- **`hyperframes remove-background` roda só em CPU** nesta máquina e é lento
  (~13 min para 28s, ~25 min para 42s, mais com pouca RAM livre). Rodar em
  segundo plano e sempre **depois** do corte de silêncio.
- O arquivo temporário (`.tmp-...-pessoa.webm`) fica com 0 bytes por vários
  minutos: não é travamento, a escrita só acontece em blocos.
- **O recorte pega pedaços da cadeira** atrás dos ombros. Atrapalha pouco e
  some quando a pessoa encolhe para o canto nos trechos de motion.
- **`pessoa.webm` é VP9 com alpha**: para ler/remapear, use
  `-c:v libvpx-vp9` antes do `-i` e grave com `-pix_fmt yuva420p
  -auto-alt-ref 0`, senão a transparência some.
- **Remapear o vídeo base exige remapear o recorte junto** (mesmo filtro de
  `trim`/`setpts` nos dois), senão a pessoa descola do fundo.
- **Chave do Google (AI Studio) sem crédito** (`402 prepayment credits are
  depleted`): gere imagens pela OpenRouter (`google/gemini-3.1-flash-image-preview`,
  `modalities:["image","text"]`, `image_config.aspect_ratio`), resposta em
  `choices[0].message.images[0].image_url.url` (data URL).

## Edição no HyperFrames (GSAP)

- **`fromTo` repetido no mesmo alvo** (`#flash`, escala da pessoa) aplica o
  "from" do último tween no momento em que o script roda: o flash fica
  visível desde o início e a pessoa volta ao tamanho cheio em trechos
  posteriores. Usar `immediateRender:false` e segmentos explícitos que cobrem
  todos os intervalos (helper `seg()` do template), mais um `set` de base em 0.
- **O canvas 3D (Three.js) cobre o texto** se ficar acima das cenas na ordem
  do DOM. Ordem certa: fundo → backdrop → canvas → textos → pessoa.
- **`check` acusa texto saindo da caixa** (ex.: "CARACTERÍSTICAS CONFIRMADAS"
  em 44px numa linha de 900px): reduza a fonte e use `white-space: nowrap`.
- **Mão ou corpo passando na frente de um item** dispara `text_occluded`.
  Quando é intencional, marcar o container com `data-layout-allow-occlusion`.
- **O `<audio>` da composição precisa de um arquivo com áudio.** Apontar para
  um vídeo remapeado sem trilha faz o render falhar com
  "asset does not match media element type (expected: audio)".
- **Valores ilustrativos inventados** num motion (ex.: "3 quartos?") só se
  ficarem marcados como inventados (vermelho, interrogação, alerta). Avisar o
  a pessoa, porque os roteiros costumam pedir "não invente dados".

## Áudio, efeitos e velocidade

- **Whoosh no corte mascara a primeira palavra da frase seguinte.** Mixar os
  efeitos com `sidechaincompress` disparado pela voz (`gerar-sfx.mjs`).
- **Mixar o áudio em WAV separado e juntar com `-c:v copy`**; renderizar
  vídeo, legenda e mixagem num comando só já gerou saltos de 3s no áudio.
  Conferir sempre `packet=pts_time` sem salto > 0,1s.
- **1,1x**: `setpts=PTS/1.1,fps=30` no vídeo e `atempo=1.1` no mix (tom da voz
  preservado). Aplicar depois de queimar a legenda.
- **Whisper inventa palavras em trechos de ruído** ("Seventy-A") e no meio de
  expressões ("aceita a pet"). Remova esses tokens do JSON antes de gerar a
  legenda, e limite o fim da última cartela à duração real do vídeo.

## ElevenLabs pela API (voz clonada)

- **401 `missing_permissions` / speech_to_speech**: a chave do `.env.local`
  precisa ter a permissão "Speech to Speech" marcada em Developers → API Keys.
- **403 `output_format_not_allowed`** para `mp3_44100_192`: no plano atual só
  `mp3_44100_128`.
- **Modelos:** a troca de voz só existe em `eleven_multilingual_sts_v2` (e um
  só em inglês). `eleven_v4`/`eleven_v3` são texto → voz.
- **A troca de voz preserva o tempo** (desvio médio 0,03s): não precisa
  realinhar a boca. Já a geração por texto (`eleven_v4`) fala mais rápido que o
  avatar e exige encaixe frase por frase (fatores 0,72x–1,03x), com a boca
  certa só no começo e no fim de cada frase.
- **A troca de voz copia os defeitos do áudio do avatar**: um som sem sentido
  entre duas cenas e a repetição de "cada imóvel" no fim apareceram na versão
  final. Para achar: `silencedetect` (noise -35dB, d 0.08) na janela suspeita e
  transcrever pedaços de 0,5–0,7s. Cortar vídeo e áudio juntos.
- No `eleven_v4`, regerar a frase quando a transcrição não bater ("anunciar"
  saiu "alugar"); cada frase custa poucos créditos.

## Meta Business Suite (programar post)

- **O navegador interno do app perde a sessão** ao fechar o painel; prefira o
  Chrome com a extensão, onde a pessoa já está logada.
- **Verificação "Usar chave de acesso"** pode travar a página: é configuração
  de segurança da conta, quem conclui é a pessoa.
- **Destino vem "Facebook + Instagram"**: abrir o combobox "Postar em" e
  desmarcar o Facebook. Cuidado: depois do upload o layout muda e um clique
  em coordenada pode cair na lista aberta e desmarcar o Instagram; conferir.
- **Não há `input[type=file]` até clicar em "Adicionar vídeo".** Instale um
  gancho em `HTMLInputElement.prototype.click` que, para `type=file`, prende o
  input no DOM em vez de abrir o seletor; depois use `file_upload` nele.
  `fetch` de arquivo local a partir da página é bloqueado pela Meta.
- **Legenda via `execCommand('insertText')` aparece na tela mas não é salva.**
  Cole com um `ClipboardEvent('paste')` com `DataTransfer` `text/plain`.
  Confirmar depois em Programados: o título do post deve mostrar o começo da
  legenda, não "Seu reel".
- **A seção Miniatura não carregou** (só barras de progresso), então a capa
  personalizada não entra por lá. Para postar com capa, use a API
  (`publicar-instagram.mjs`).
- "Horários ativos" no agendamento mostra o pico de público segundo a Meta
  (ex.: 18h), que pode divergir do engajamento medido nos posts.

## LinkedIn (vídeo)

- **Use o caminho legado**, o mesmo usado para imagem
  (`lib/services/linkedin-api.ts`): `/v2/assets?action=registerUpload` com
  `urn:li:digitalmediaRecipe:feedshare-video` → PUT do binário → `/v2/ugcPosts`
  com `shareMediaCategory: "VIDEO"`. Misturar com `/rest/videos`
  (`urn:li:video`) dá "not owned by the author" (400).
- `/v2/assets` **não** leva o header `LinkedIn-Version` (só os `/rest/*`).
- Depois do PUT, consulte `GET /v2/assets/{id}` até `recipes[0].status ==
  "AVAILABLE"` antes de postar (levou ~10s para 7,6 MB). `CLIENT_ERROR` ou
  `SERVER_ERROR` encerram o processamento sem recuperação.
- O id do post vem no header `x-restli-id` (`urn:li:ugcPost:...`); o link é
  `https://www.linkedin.com/feed/update/<urn>/`.
- Limites do LinkedIn: 5 GB e 10 min por vídeo. Vertical 9:16 é aceito, mas
  aparece menor no feed (faixas laterais).
- Sem agendamento pela API: a publicação é imediata. Antes, validar o token
  com `GET /v2/userinfo` (HTTP 200).
- O texto do LinkedIn não é a legenda do Instagram: 3 a 5 hashtags, sem
  "Comenta aqui" genérico, sem travessão.

## Layout dividido (formato profissional, 11/10/2026)

- **Legenda cobrindo a boca no cartão:** a 75% da altura ela cai em cima do
  rosto. Usar tamanho 32 e MarginV 140 (~88%), por baixo do queixo.
- **Cartão tela cheia ↔ dividido:** animar `left/top/width/height/borderRadius/
  borderWidth` com `fromTo(..., immediateRender:false)`; o `<video>` interno
  usa `object-fit: cover` e acompanha sozinho.
- **`npx hyperframes render` interrompido deixa `.motion.hf-transaction-*`
  em `renders/`:** apague a pasta e rode de novo (em segundo plano, leva minutos).
- **Ficha/cartão com altura curta:** o `check` avisa `text_box_overflow` de
  poucos px; aumente o `height` do card em vez de reduzir a fonte.
- **1,1x:** acelerar vídeo e áudio juntos no ffmpeg final (`setpts=PTS/1.1` +
  `atempo=1.1`); a trilha acelera junto, sem problema perceptível.

## Fundo e repetições do avatar (19/10/2026)

- **Padrão: fundo original.** Não apagar o fundo, a menos
  que o fundo venha definido no prompt ou como detalhe de edição. O cenário varia
  um pouco entre cenas e isso é aceito; não rode `remove-background`.
- **O avatar repete trechos no fim da cena** ("avisa a hora" duas vezes, "o
  histórico, o histórico"). A transcrição por cena (Passo 3) não pegou nenhuma;
  só a retranscrição do vídeo cortado inteiro, comparada ao roteiro, achou. Sempre
  fazer o Passo 4b antes da troca de voz, e de novo no vídeo final.
- **Celular no quadro (selfie):** às vezes o avatar aparece segurando o aparelho.
  Se atrapalhar, regere só aquela cena com "o celular e a mão que o segura não
  aparecem no quadro" e troque também a frase "segura o próprio celular" do texto
  base, senão o prompt se contradiz.
- **Anexar o avatar no Flow:** depois de clicar em `+`, clique no campo de busca
  antes de digitar "Eu". Sem isso a digitação não entra, a lista mostra os
  vídeos recentes e é fácil anexar um vídeo no lugar do avatar. Confirme que a
  miniatura anexada é o avatar (círculo com o rosto) antes de enviar.
- **Baixa depois de postar:** se o roteiro nasceu de um item de planejamento
  (calendário editorial, CRM, planilha), dê baixa nesse item pelo fluxo do próprio
  sistema (link e horário da publicação) e **não crie um registro paralelo**, que
  duplica. Confirme no sistema que o status mudou. Configure o destino em
  `perfil.baixaNoCrm`.

## Reel em camadas e voz (21/10/2026)

- **`FLOW_REEL_ENV`:** o repositório não carrega o `.env.local` de outro projeto sozinho. Aponte com
  `export FLOW_REEL_ENV=/caminho/do/.env.local` (sem copiar segredo para o repo).
- **Microfone no peito do avatar:** em 3 de 6 cenas apareceu um microfone verde (vem da referência do avatar).
  Regere essas cenas com "Não há nenhum microfone nem objeto na frente do peito dele".
- **Chip do Flow no projeto novo:** pode vir 16:9, 10s e x4 (60 créditos). Conferir e ajustar para 9:16, 8s, x1 antes da 1ª cena.
- **Transcritores divergem:** o Groq inseriu "a" em "comenta a automação" mesmo no áudio ORIGINAL. Confirme com o
  OpenAI antes de gastar créditos refazendo voz.
- **Valores falados:** o Whisper escreve "cento e cinquenta reais" como "R$ 150,00" em dois tokens. Antes de gerar a
  legenda, junte em "R$150" e troque "Grock/Groq" por "Grok" num `palavras_legenda.json` separado.
- **`aplicar-estilo-template.mjs` falhava ao reaplicar** por a fonte do sistema vir somente leitura; o script agora apaga o destino antes de copiar.
- **Voz grave e pausada após a troca (21/10/2026):** a troca de voz mantém o ritmo e a gravidade da voz sintética do Flow
  (o clone tinha só 2 amostras). Saídas: 1,2x com `rubberband` +1 a +3 semitons, ou `gerar-voz-tts.mjs` (fala por texto).
- **Fala por texto engole artigos curtos** ("o" em "sendo o humano") e pode trocar palavras ("com direito a" virou
  "empreguei pra"). Dois transcritores concordando é a prova; um só pode errar. Frase só passa se a conferência feita
  DEPOIS do encaixe (`atempo`) ainda ouvir o texto certo, porque esticar o áudio pode apagar a palavra.
- **Variante que acerta pode trazer palavra a mais** ("..., tá?"): cortar no fim da última palavra do roteiro antes de usar.
- **Regex em string de template perde a barra invertida** ao gerar scripts por substituição de texto (`/s+/` virou `/s+/` e
  quebrou a comparação). Sempre rodar um teste mínimo do conferidor com um texto conhecido.

## Onboarding e cartela (31/10/2026)

- **Cor de destaque medida errada:** a média por quantização puxava o neon para o tom do
  brilho difuso (`#04843C` em vez de `#00FF66`) e deixava passar tom de pele. O
  `extrair-estilo.mjs` agora só considera pixels saturados e claros, agrupa por matiz e
  mede a cor nos pixels mais brilhantes; o consenso entre vídeos acertou `#07F364` em 3 de 4.
  O hex exato da marca não sobrevive à compressão: confirme com a pessoa.
- **Reel com música da biblioteca do Instagram não tem `media_url`** na API; use outro.
- **`drawtext` com `textfile`:** sem `expansion=none`, um `%` no texto faz a linha inteira
  sumir sem erro; uma quebra de linha no arquivo vira um quadradinho. Uma linha por `drawtext`.
- **Fonte copiada duas vezes dá `EPERM`** (a fonte instalada no Windows vem somente leitura e a
  cópia herda isso). Use `copiarFonte()` de `lib/midia.mjs` em qualquer script novo.
- **Substituição de código pela linha de comando (`sed`, `node -e`) perde barra invertida** em
  regex e quebra em silêncio (`/\s+/` virou `/s+/`, `/\[nr]/` virou `/\[nr]/`). Edite com o
  editor, nunca por substituição de texto no shell.
