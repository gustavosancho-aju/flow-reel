# flow-reel

Skill do Claude Code que cria **Reels com o seu avatar** no Google Flow, do tema ao
Instagram: roteiro, cenas em formato selfie, conferência e correção da fala, corte
de silêncio, edição com motions no seu estilo, legenda, voz clonada (opcional),
capa e publicação. Também edita **vídeos já gravados**, como visitas a imóveis e
depoimentos, em **9:16 (vertical)** ou **16:9 (horizontal)**, sem gerar cenas no Flow.

Para personalizar a edição, o skill pede **4 vídeos de referência**,
extrai deles cores, fontes, legenda, layout e elementos gráficos, confirma com
você e grava tudo em `perfil/estilo.json`. Os Reels seguintes já saem com essa cara.
Também é possível escolher explicitamente o estilo básico incluído e começar sem referências.

## O que você precisa

| Item | Para quê | Obrigatório |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | roda o skill `/flow-reel` | para o skill; os scripts funcionam no terminal |
| [Node.js 22+](https://nodejs.org/en/download) e [FFmpeg/ffprobe](https://ffmpeg.org/download.html) no PATH | scripts, cortes, legenda, capa | sim |
| Conta do Google Flow com créditos e um **avatar seu** criado | geração das cenas | só no modo avatar |
| Extensão Claude in Chrome | dirigir o Flow no navegador | só no modo avatar |
| OpenAI e Groq | conferência da fala e timestamps, respectivamente | conforme scripts usados |
| [HyperFrames](https://hyperframes.heygen.com) (`npx`) | edição com motions | quando usar motions; requer internet na primeira execução |
| ElevenLabs (voz clonada + permissão "Speech to Speech") | trocar pela sua voz | opcional |
| Instagram (token Meta) e Supabase privado com URLs assinadas | publicar pela API | opcional |
| [auto-editor 31.x](https://auto-editor.com/installing) | motor alternativo de corte | opcional |
| LinkedIn (token) | publicar o vídeo lá | opcional |

Custos do Flow (Omni 1.1 Flash, 720p, 8s): 12 créditos por cena; um Reel de 7 cenas
usa 84 créditos. O modo gravado não consome créditos do Flow.

## Instalação e primeiro vídeo local

O clone inclui fontes Poppins e IBM Plex Mono com suas licenças OFL. Não é
necessário copiar fontes, vídeos, perfil, `.env` ou ferramentas da máquina do autor.

1. Instale Node.js **22 ou superior**, Git e uma distribuição completa de FFmpeg
   que inclua `ffprobe`, `drawtext`, `subtitles` (libass), `libx264` e AAC.
   No Windows, coloque a pasta `bin` do FFmpeg no PATH e reabra o terminal.
   No macOS, `brew install ffmpeg`; em Debian/Ubuntu, `sudo apt install ffmpeg`.
   Os [downloads oficiais](https://ffmpeg.org/download.html) indicam as distribuições
   disponíveis. O diagnóstico abaixo informa exatamente o que faltar.
2. Clone e verifique as dependências (os comandos npm funcionam em PowerShell,
   macOS e Linux):

```bash
git clone https://github.com/gustavosancho-aju/flow-reel.git
cd flow-reel
npm install
npm run diagnostico
```

3. Configure seu perfil com o assistente interativo:

```bash
npm run configurar
```

Ou use a configuração direta para vídeo gravado, escolhendo o estilo básico:

```bash
npm run configurar -- --modo gravado --nome "Seu nome real" --nicho "Seu assunto" --estilo-basico
node scripts/validar-perfil.mjs
npm run exemplo
```

O exemplo gera a própria imagem, um tom de áudio e palavras de demonstração;
exporta `test-output/exemplo-local/final.mp4`, capa, cartela de legenda e template
HyperFrames. Não transcreve uma fala nem chama APIs. Em nova execução, escolha
outra pasta: `npm run exemplo -- test-output/outro-exemplo "16:9"`.

4. Para começar a editar seu próprio vídeo:

```bash
npm run editar -- "caminho/do/bruto.mp4" "videos/minha-edicao" "9:16"
```

Esse comando prepara o vídeo, mantém a voz em 1x, exporta `final.mp4`, cria `capa.jpg`
e prepara `edicao/index.html` com fontes e mídia locais. A pasta de saída precisa
ser nova ou vazia. O silêncio só é cortado quando você acrescenta
`--cortar-silencio`, para preservar cenas sem fala em visitas e demonstrações.
Para horizontal, use `"16:9"`. A entrada precisa ter áudio e imagem.

Para queimar legendas, acrescente `--palavras caminho/palavras.json`, uma lista
`[{"texto":"Olá","inicio":0.2,"fim":0.6}]` cujos tempos correspondam ao vídeo
**após os cortes**. Pode ser produzida por um transcritor local de sua escolha ou
por `timestamps-palavras.mjs` com Groq. O comando não transcreve automaticamente.
Sem esse argumento, a exportação inicial não tem legendas. A capa usa um título
neutro; personalize `L1`, `L2`, `L3` e `SUB` como documentado no skill.

O template HyperFrames é um ponto de partida. Personalize textos, painéis e os
respectivos tempos para a sua fala; o exemplo do template contém 29,35s. Instale
os recursos HyperFrames quando for usar motions. A exportação local inicial usa
FFmpeg e não exige essa instalação. Veja o fluxo completo no [SKILL.md](SKILL.md).

`configurar` cria `perfil/perfil.json`, `.env.local` e, se você escolher
`--estilo-basico`, `perfil/estilo.json`. Arquivos existentes são preservados.
A voz inicial é a original e a publicação fica desativada; você pode habilitar
voz clonada e redes depois, com suas próprias contas. Sem `--estilo-basico`, siga
o onboarding de referências para criar sua identidade visual. Os arquivos `.env`
começam sem chaves; edição/exportação local não exige preenchê-los.

### Instalar como skill

Para usar `/flow-reel`, clone no projeto do Claude Code:

```bash
git clone https://github.com/gustavosancho-aju/flow-reel.git .claude/skills/flow-reel
cd .claude/skills/flow-reel
npm install
npm run diagnostico
```

Para usar em todos os projetos, clone em `~/.claude/skills/flow-reel`.

Configure as chaves no `.env.local` da raiz do flow-reel. O antigo campo
`perfil.envArquivo` é ignorado: arquivos de ambiente externos não são carregados.

Para atualizar: `git pull` dentro da pasta do skill. Seu `perfil/` e seu `.env.local` não são
versionados, então a atualização não mexe neles.

**Se você mantém o repositório em outra pasta** (para editar e versionar), ligue o skill a ela em
vez de clonar duas vezes. No Windows (PowerShell, sem precisar de administrador):

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\flow-reel" -Target "C:\caminho\do\flow-reel"
```

No macOS/Linux: `ln -s /caminho/do/flow-reel ~/.claude/skills/flow-reel`.

## Primeiro uso

Abra o Claude Code e peça, por exemplo: `/flow-reel quero um Reel sobre <tema>`.

Se ainda não escolheu um estilo básico com `npm run configurar`, o skill faz o onboarding de referências:

1. **Pede 4 vídeos de referência** (caminhos de arquivo, ou links se você tiver o
   `yt-dlp`). Dica: um com legenda marcante, um com painéis animados, um com
   abertura forte, um com CTA no final.
2. **Extrai** de cada um: 12 quadros, os 3 primeiros segundos, o final, a paleta de
   cores, o ritmo de cortes (`scripts/extrair-estilo.mjs`).
3. **Lê os quadros** e propõe: cores, fontes (e **pergunta o nome e o arquivo exato**,
   porque fonte não se adivinha pela imagem), estilo de legenda, layout e elementos.
4. **Mostra uma cartela de estilo** (cores, fontes, legenda, pílulas e cartões, sem precisar de vídeo) e só segue com a sua aprovação.
5. **Pergunta o resto do perfil**: nome, nicho, nome do avatar no Flow, cenário e
   figurino fixos, voz, destinos de publicação. No modo gravado, não pede os dados
   do Flow e mantém a voz original por padrão.

Depois disso, `node scripts/validar-perfil.mjs` responde `pronto: true` e cada novo
Reel pula direto para o roteiro. Para vídeo gravado, valide com
`node scripts/validar-perfil.mjs gravado` e siga a entrada alternativa abaixo.

## Fluxo com avatar (padrão preservado)

| # | Passo | Script |
|---|---|---|
| 0 | Valida perfil (ou faz o onboarding) | `validar-perfil.mjs` |
| 1 | Roteiro (se você não trouxe pronto) | |
| 2 | Gera as cenas no Flow e baixa | (Chrome) |
| 3 | Confere cada cena, monta base e folha de contato | `transcrever-openai.mjs` |
| 4 | Corta silêncio, **retranscreve** para caçar repetições e erros do avatar e alinha o roteiro com os tempos | `cortar-silencio.mjs` ou `cortar-video.mjs`, `timestamps-palavras.mjs`, `frases.mjs` |
| 5 | Mantém o **fundo original** (fundo único só se você pedir) | `gerar-fundo.mjs` (opcional) |
| 7 | Voz: fala por texto com a sua voz clonada e **sincronia labial por palavra** (padrão), conferida frase a frase; teste A/B opcional com troca de voz e voz do Flow | `gerar-voz.mjs`, `escolher-voz.mjs` |
| 6 | Edita com motions no seu estilo | `aplicar-estilo-template.mjs`, HyperFrames |
| 8 | Legenda com o texto do roteiro e os tempos da voz, montagem final na velocidade do perfil e conferência da fala | `palavras-legenda.mjs`, `gerar-legenda.mjs`, `verificar-legenda.mjs` |
| 9 | Capa e legenda do post | `gerar-capa.mjs` |
| 10 | Publica (só com a sua ordem) | `upload-supabase.mjs`, `publicar-instagram.mjs`, `publicar-linkedin-video.mjs` |

O Passo 7 vem antes do 6 de propósito: os tempos da voz final guiam os motions.

O comando legado `node scripts/aplicar-estilo-template.mjs edicao/index.html camadas`
continua disponível para avatar em 9:16. Também aceita `dividido`; formato, modo e
layout podem ser passados em qualquer ordem. O layout em camadas exige o recorte
`pessoa.webm`; para vídeo gravado ou 16:9, use o layout dividido.

## Modo vídeo gravado

Peça, por exemplo: `/flow-reel edite o vídeo gravado C:/videos/visita.mp4 em 16:9`.
O skill pula roteiro e **Passo 2 (Google Flow)** e reaproveita a conferência da fala,
corte de silêncio/repetições, timestamps, legenda, motions HyperFrames, capa e
publicação. A identidade visual continua vindo do seu perfil e das referências.

Para preparar o material manualmente, execute da raiz do flow-reel:

```bash
node scripts/validar-perfil.mjs gravado
node scripts/preparar-video-gravado.mjs "C:/videos/visita.mp4" videos/visita "16:9"
node scripts/transcrever-openai.mjs videos/visita/voz16.mp3
node scripts/cortar-video.mjs videos/visita/base.mp4 videos/visita/sem_silencio.mp4
```

A preparação cria uma pasta de trabalho com:

- `base.mp4`: vídeo H.264/AAC a 30 fps, 1080×1920 ou 1920×1080. Mantém a imagem
  inteira com faixas, se necessário, sem distorcer. O bruto não é alterado.
- `voz16.mp3`: áudio mono de 16 kHz para a primeira transcrição.
- `projeto.json`: origem, modo, formato, dimensões, próximos passos e velocidade 1x.

Sem o último argumento, o formato é inferido pela orientação de exibição, incluindo
rotação de celular. A entrada precisa ter imagem e áudio; a preparação recusa
sobrescrever as saídas de um projeto existente. O manifesto é uma referência para
os próximos comandos, não um orquestrador automático.

Confira a transcrição e os cortes. A remoção de repetições continua sendo orientada
pela transcrição: corte imagem e áudio juntos e retranscreva o `limpo.mp4`.
Em visitas, preserve trechos sem fala que mostram o imóvel. No gravado, a referência
é a fala original, sem exigir um roteiro e sem reescrever um depoimento.

Depois dos cortes, extraia o áudio novamente e use o **mesmo formato** na edição,
legenda e capa (troque `16:9` por `9:16` para vertical):

```bash
ffmpeg -i videos/visita/limpo.mp4 -vn -ac 1 -ar 16000 videos/visita/voz-limpa.mp3
node scripts/timestamps-palavras.mjs videos/visita/voz-limpa.mp3 videos/visita/palavras.json
npx hyperframes init "videos/visita/edicao" --non-interactive --example=blank --skill=general-video
node scripts/aplicar-estilo-template.mjs videos/visita/edicao/index.html "16:9" gravado
node scripts/gerar-legenda.mjs videos/visita/palavras.json videos/visita/legenda.ass "16:9"
node scripts/gerar-capa.mjs foto.jpg videos/visita/capa.jpg "16:9"
```

O template é o ponto de partida: copie o vídeo limpo para `edicao/media/rosto.mp4`
e o áudio final para `edicao/media/audio.wav`; adapte textos, painéis e tempos à fala,
incluindo a duração da composição e dos clipes (o exemplo tem 29,35s). Em 16:9,
painel e vídeo ficam lado a lado. No gravado, a imagem usa `contain` e os zooms do
exemplo ficam desativados. Confira os snapshots antes de renderizar no HyperFrames.

Siga os Passos 4 a 10 do [SKILL.md](SKILL.md). Mantenha voz, cenário e **velocidade
1x** no gravado; troca de voz e aceleração só se solicitadas. Na montagem final,
use `setpts=PTS/1` e `atempo=1`. O fluxo de avatar continua com 9:16 e a velocidade
configurada em `perfil.velocidadeFinal` (1,1x por padrão). Sem argumentos adicionais,
legenda, capa e template mantêm o comportamento vertical atual.

A capa pode partir de um quadro do imóvel/depoimento. Escolha o destino e formato
de publicação: o LinkedIn recebe o arquivo local no formato escolhido; o script do
Instagram continua criando Reels com vídeo e capa acessíveis por URL assinada.
Para uma versão vertical de um material horizontal, prepare em 9:16 e confira as
faixas/enquadramento. Publicação continua dependendo de ordem explícita.

## Corte de silêncio: FFmpeg ou auto-editor

Os comandos antigos continuam funcionando. O seletor novo usa FFmpeg por padrão:

```bash
node scripts/cortar-silencio.mjs base.mp4 sem_silencio.mp4 0.35 0.12
node scripts/cortar-video.mjs base.mp4 sem_silencio.mp4 ffmpeg 0.35 0.12
node scripts/cortar-video.mjs base.mp4 sem_silencio.mp4 auto-editor 0.35 0.12 0.025
```

Argumentos do seletor: entrada, saída, motor, silêncio mínimo (segundos), margem
(segundos) e limiar de áudio (só auto-editor; entre 0 e 1, exclusivo em 0).
Passar um limiar com o motor `ffmpeg` causa erro, mesmo que seja o valor padrão;
esse parâmetro não é silenciosamente ignorado.
O motor alternativo usa áudio, margem e suavização para cortar imagem e som juntos,
sem mudar as dimensões. Os detectores são diferentes: revise os cortes e ajuste os
valores. Nenhum dos dois identifica repetições de fala automaticamente.

Instale o binário da [distribuição oficial](https://auto-editor.com/installing)
do [auto-editor](https://github.com/WyattBlue/auto-editor), CLI 31.x, e coloque-o
no PATH ou configure `AUTO_EDITOR_PATH`. Não é instalado pelo npm nem por pip.
Se faltar o executável ou o corte falhar, o comando termina com erro; para usar a
alternativa, repita com `ffmpeg`. [Opções utilizadas](https://auto-editor.com/ref/options).

## Variáveis de ambiente

Copie `.env.exemplo` para **`.env.local` na raiz do próprio flow-reel**. Os scripts
leem somente `<flow-reel>/.env.local` e `<flow-reel>/.env`, nessa prioridade;
`process.env` fornece valores para nomes ausentes ou vazios nesses arquivos. Arquivos da
pasta onde o comando é executado, `FLOW_REEL_ENV` e `perfil.envArquivo` são ignorados. Arquivos `.env`
não interpretam expressões de shell; coloque cada valor em uma linha, sem comentários
na mesma linha. Não cole credenciais na conversa.

| Variável | Uso |
|---|---|
| `OPENAI_API_KEY` | `transcrever-openai.mjs`: confere a fala com OpenAI |
| `GROQ_API_KEY` | `timestamps-palavras.mjs`: timestamps por palavra com Groq |
| `ELEVENLABS_API_KEY` | Voz clonada opcional: Text to Speech no modo texto, Speech to Speech no modo troca |
| `ELEVENLABS_VOICE_ID` | ID da voz; o nome da variável pode ser alterado em `perfil.voz.voiceIdEnv` |
| `OPENROUTER_API_KEY` | Geração opcional de fundo único |
| `META_ACCESS_TOKEN` | Publicação de Reels pela API do Instagram |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Conta de destino do Instagram |
| `LINKEDIN_ACCESS_TOKEN` | Publicação nativa no LinkedIn |
| `AUTO_EDITOR_PATH` | Caminho do executável, sem aspas internas/argumentos; vazio usa o PATH |
| `SUPABASE_URL` | Origem HTTPS do projeto; aceita `NEXT_PUBLIC_SUPABASE_URL` como alternativa legada |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publishable; aceita anon legada. Chaves administrativas são rejeitadas |
| `SUPABASE_STORAGE_REFRESH_TOKEN` | Refresh token inicial do usuário dedicado; renova o login antes de cada upload |
| `SUPABASE_STORAGE_ACCESS_TOKEN` | Opcional: JWT inicial para conferir a identidade esperada; o upload usa o JWT renovado |
| `SUPABASE_STORAGE_BUCKET` | Bucket privado dedicado; padrão `flow-reel-media` |
| `SUPABASE_SIGNED_URL_TTL` | Validade da URL em segundos: padrão 21600 (6h), intervalo 300 a 604800 |

Os comandos documentados usam OpenAI para conferência e Groq para timestamps:
esses scripts não alternam automaticamente entre provedores. Configure ambos se
for executar a sequência completa. Chaves de voz, fundo e publicação só são
necessárias para os módulos escolhidos.

### Migração do upload Supabase

`SUPABASE_SERVICE_ROLE_KEY` deixou de ser usada. A restrição de acesso é feita
com **publishable + JWT de um usuário dedicado + RLS**; a chave publishable sozinha
não é uma credencial privada limitada a um bucket.

1. Crie um usuário dedicado no Supabase Auth e obtenha o refresh token da sessão
   dele. Configure-o em `SUPABASE_STORAGE_REFRESH_TOKEN`; o JWT inicial é opcional,
   para conferir a identidade esperada. O script renova a sessão antes de cada upload,
   inclusive quando o JWT anterior expirou, sem guardar senha e sem chave admin.
2. Abra [references/supabase-storage.sql](references/supabase-storage.sql), substitua
   os UUIDs zerados pelo ID desse usuário e execute no SQL Editor. O SQL cria um
   bucket **privado** com MIME de vídeo/capa e permite somente INSERT e SELECT
   dos objetos do usuário. Revise políticas existentes: permissões amplas também
   podem conceder acesso a outros buckets, pois políticas permissivas usam OR.
3. Configure as variáveis acima no `.env.local`. Remova a chave administrativa
   antiga desse arquivo. Se escolher outro nome de bucket, ajuste o SQL e a variável
   juntos. O script recusa um argumento de bucket diferente do configurado.
4. Use destinos únicos: o upload não sobrescreve arquivos e não exige UPDATE/DELETE.

O refresh token rotacionado fica em `.supabase-session.json` na raiz do flow-reel,
fora do Git; esse cache tem prioridade sobre o token inicial do `.env.local`.
A gravação é atômica e acontece antes de enviar a mídia, portanto uma falha de
upload não perde a sessão renovada. Há um bloqueio para impedir duas renovações
simultâneas: se outro upload estiver renovando, aguarde e tente de novo.
Se o login for revogado, faça novo login, atualize o refresh token inicial e remova
o cache local. Ao trocar de projeto/usuário, remova o cache e atualize também o JWT
opcional. Se um processo for encerrado à força durante a renovação, confira se ele
parou antes de remover o arquivo `.supabase-session.json.lock` restante.

```bash
node scripts/upload-supabase.mjs final.mp4 reels/visita-20261102-a.mp4 video/mp4
node scripts/upload-supabase.mjs capa.jpg reels/visita-20261102-a.jpg image/jpeg
node scripts/publicar-instagram.mjs "URL_ASSINADA_VIDEO" "URL_ASSINADA_CAPA" legenda.txt
```

Cada upload imprime uma URL assinada temporária, compatível com o download da mídia
pela API sem autenticação adicional. Gere as URLs perto da publicação e mantenha-as
válidas até o processamento terminar; agendamentos futuros precisam de URLs novas
ou de validade adequada. Expirar a URL não apaga o objeto: a limpeza do bucket cabe
ao administrador. A configuração remota é uma etapa de instalação; não é executada
pelo script. Referências: [controle de acesso do Storage](https://supabase.com/docs/guides/storage/security/access-control)
e [URLs assinadas](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).

## Testes e licença

```bash
npm test
```

Os testes usam o executor nativo do Node, arquivos temporários e chamadas HTTP
simuladas, sem instalar dependências nem consumir APIs. Cobrem validação de perfil
(avatar e gravado), primeiro uso, referências, fontes e JSON inválido; geração ASS,
agrupamento, sobreposições, supressão sob motion, formatos e arredondamento de tempos;
além da seleção de corte e das restrições de upload/configuração.

Para exercitar o upload de arquivos reais sem credenciais nem publicação, use uma
pasta de relatório nova em cada execução:

```bash
node tests/e2e-upload-local.mjs final.mp4 capa.jpg test-output/upload-local-1
```

O teste sobe um servidor HTTP apenas em localhost, simula Auth/Storage, verifica
duas renovações consecutivas com refresh token rotacionado e compara o SHA-256 de
vídeo/capa baixados pelas URLs assinadas. Isso testa o cliente com arquivos reais;
não valida as políticas RLS de um projeto Supabase remoto.

Código sob licença [MIT](LICENSE). As fontes em `assets/fonts/` mantêm suas
licenças SIL OFL 1.1, incluídas junto aos arquivos; as licenças também são copiadas
para os projetos que usam essas fontes.

O LinkedIn lê somente `LINKEDIN_ACCESS_TOKEN`. O antigo modo
`LINKEDIN_TOKEN_FROM_SUPABASE` foi retirado; o script não consulta tabelas de segredos.

## Estrutura

```
SKILL.md                  instruções que o Claude segue (fluxo completo)
perfil/
  perfil.exemplo.json     quem é você, avatar, voz, publicação
  estilo.exemplo.json     cores, fontes, legenda, layout, elementos
  perfil.json, estilo.json, referencias/, fotos/, fontes/   SEUS (ficam fora do git)
scripts/                  configuração, diagnóstico, edição local e um script por etapa
assets/fonts/             fontes redistribuíveis, licenças OFL e origem/SHA-256
tests/                    testes de perfil, legenda, corte e segurança
package.json              npm test (executor nativo do Node)
LICENSE                   licença MIT
assets/edicao-template.html   composição HyperFrames com tokens de estilo
references/               prompts, armadilhas já resolvidas, notas de design
.env.exemplo              variáveis de ambiente (copie para .env.local)
```

## Privacidade

`perfil/perfil.json`, `perfil/estilo.json`, as referências, as fotos e o `.env.local`
estão no `.gitignore`. O que vai para o repositório é só o código, os exemplos
neutros e a documentação. Chaves de API nunca ficam em arquivo versionado nem
precisam ser coladas na conversa.

## Segurança de publicação

Publicar é público. O skill **nunca** publica sem ordem explícita ("poste agora",
"programe para...") e a regra vale para qualquer rede configurada.

## Limitações conhecidas

- A extração de estilo mede cor e ritmo; **fonte, layout e elementos dependem do
  Claude olhar os quadros** e de você confirmar.
- O Flow varia o fundo entre cenas. O padrão é aceitar isso; para cenário idêntico
  use o fundo único (lento, roda em CPU).
- O avatar às vezes repete palavras no fim da cena; o Passo 4 (retranscrição)
  existe para pegar isso, mas vale uma escuta final.
- Fontes padrão são incluídas e resolvidas a partir do clone. Fontes próprias podem
  usar caminhos absolutos ou relativos à raiz do flow-reel; não dependem do cwd.
- O teste desta revisão foi executado em Windows com clone limpo. A matriz CI está
  configurada para repetir os mesmos comandos em Windows, macOS e Linux.
