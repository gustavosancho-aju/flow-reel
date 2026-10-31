# flow-reel

Skill do Claude Code que cria **Reels com o seu avatar** no Google Flow, do tema ao
Instagram: roteiro, cenas em formato selfie, conferência e correção da fala, corte
de silêncio, edição com motions no seu estilo, legenda, voz clonada (opcional),
capa e publicação.

O que o torna seu: na **primeira vez** o skill pede **4 vídeos de referência**,
extrai deles cores, fontes, legenda, layout e elementos gráficos, confirma com
você e grava tudo em `perfil/estilo.json`. Os Reels seguintes já saem com essa cara.

## O que você precisa

| Item | Para quê | Obrigatório |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | roda o skill | sim |
| Node.js 18+ e [ffmpeg](https://ffmpeg.org) no PATH | scripts, cortes, legenda, capa | sim |
| Conta do Google Flow com créditos e um **avatar seu** criado | geração das cenas | sim |
| Extensão Claude in Chrome | dirigir o Flow no navegador | sim |
| Chave de transcrição (OpenAI ou Groq) | conferir a fala | sim |
| [HyperFrames](https://hyperframes.heygen.com) (`npx`) | edição com motions | sim |
| ElevenLabs (voz clonada + permissão "Speech to Speech") | trocar pela sua voz | opcional |
| Instagram (token Meta) e um bucket público para hospedar o vídeo | publicar pela API | opcional |
| LinkedIn (token) | publicar o vídeo lá | opcional |

Custos do Flow (Omni 1.1 Flash, 720p, 8s): 12 créditos por cena; um Reel de 7 cenas
usa 84 créditos.

## Instalação

Dentro do projeto onde você quer usar:

```bash
git clone https://github.com/gustavosancho-aju/flow-reel.git .claude/skills/flow-reel
cd .claude/skills/flow-reel
cp .env.exemplo .env.local      # preencha só os módulos que for usar
```

Para usar em todos os projetos, clone em `~/.claude/skills/flow-reel`.

Se as suas chaves já estão no `.env.local` de outro projeto, não copie: depois do primeiro uso,
coloque o caminho dele em `perfil/perfil.json`, no campo `envArquivo`.

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

Como ainda não existe `perfil/estilo.json`, o skill faz o onboarding:

1. **Pede 4 vídeos de referência** (caminhos de arquivo, ou links se você tiver o
   `yt-dlp`). Dica: um com legenda marcante, um com painéis animados, um com
   abertura forte, um com CTA no final.
2. **Extrai** de cada um: 12 quadros, os 3 primeiros segundos, o final, a paleta de
   cores, o ritmo de cortes (`scripts/extrair-estilo.mjs`).
3. **Lê os quadros** e propõe: cores, fontes (e **pergunta o nome e o arquivo exato**,
   porque fonte não se adivinha pela imagem), estilo de legenda, layout e elementos.
4. **Mostra uma prévia** e só segue com a sua aprovação.
5. **Pergunta o resto do perfil**: nome, nicho, nome do avatar no Flow, cenário e
   figurino fixos, voz, destinos de publicação.

Depois disso, `node scripts/validar-perfil.mjs` responde `pronto: true` e cada novo
Reel pula direto para o roteiro.

## Fluxo de cada Reel

| # | Passo | Script |
|---|---|---|
| 0 | Valida perfil (ou faz o onboarding) | `validar-perfil.mjs` |
| 1 | Roteiro (se você não trouxe pronto) | |
| 2 | Gera as cenas no Flow e baixa | (Chrome) |
| 3 | Confere cada cena, monta base e folha de contato | `transcrever-openai.mjs` |
| 4 | Corta silêncio, **retranscreve** para caçar repetições e erros do avatar e alinha o roteiro com os tempos | `cortar-silencio.mjs`, `timestamps-palavras.mjs`, `frases.mjs` |
| 5 | Mantém o **fundo original** (fundo único só se você pedir) | `gerar-fundo.mjs` (opcional) |
| 7 | Voz: teste A/B guiado na primeira vez (voz do Flow, troca de voz ou fala por texto, com variações de tom), depois automática com conferência frase a frase | `escolher-voz.mjs`, `gerar-voz.mjs` |
| 6 | Edita com motions no seu estilo | `aplicar-estilo-template.mjs`, HyperFrames |
| 8 | Legenda e montagem final em 1,1x, com conferência da fala | `gerar-legenda.mjs`, `verificar-legenda.mjs` |
| 9 | Capa e legenda do post | `gerar-capa.mjs` |
| 10 | Publica (só com a sua ordem) | `upload-supabase.mjs`, `publicar-instagram.mjs`, `publicar-linkedin-video.mjs` |

O Passo 7 vem antes do 6 de propósito: os tempos da voz final guiam os motions.

## Estrutura

```
SKILL.md                  instruções que o Claude segue (fluxo completo)
perfil/
  perfil.exemplo.json     quem é você, avatar, voz, publicação
  estilo.exemplo.json     cores, fontes, legenda, layout, elementos
  perfil.json, estilo.json, referencias/, fotos/, fontes/   SEUS (ficam fora do git)
scripts/                  um script por etapa; lib/config.mjs lê env, perfil e estilo
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
- Testado no Windows. Em macOS/Linux, ajuste os caminhos de fonte no `estilo.json`.
