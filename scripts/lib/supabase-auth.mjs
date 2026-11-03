/** Renovação de sessão Auth com rotação persistida, sem credenciais admin. */
import { closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { RAIZ } from "./raiz.mjs";

export function claimsToken(token) {
  try {
    const valor = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return valor && typeof valor === "object" ? valor : {};
  }
  catch { return {}; }
}

export function usuarioToken(token) {
  const usuario = claimsToken(token);
  if (usuario.role !== "authenticated" || typeof usuario.sub !== "string" || !usuario.sub) {
    throw new Error("O token deve ser o JWT de um usuário dedicado autenticado, limitado por RLS.");
  }
  return usuario;
}

export function processoExiste(pid) {
  try { process.kill(pid, 0); return true; }
  catch (erro) { return erro.code !== 'ESRCH'; } // EPERM não significa processo morto.
}

export function adquirirTrava(lock, { agora = Date.now, existe = processoExiste, maxIdade = 300000 } = {}) {
  const dono = { id: randomUUID(), pid: process.pid, criadoEm: agora() };
  const conferir = () => {
    try { return JSON.parse(readFileSync(lock, 'utf8')).id === dono.id; } catch { return false; }
  };
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let fd;
    try {
      fd = openSync(lock, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify(dono));
      closeSync(fd); fd = undefined;
      return { conferir, liberar() { if (conferir()) unlinkSync(lock); } };
    } catch (erro) {
      if (fd !== undefined) { closeSync(fd); unlinkSync(lock); }
      if (erro.code !== 'EEXIST') throw new Error('Não foi possível bloquear o arquivo local de sessão Supabase.');
      try {
        const antes = statSync(lock), conteudo = readFileSync(lock, 'utf8');
        let outro; try { outro = JSON.parse(conteudo); } catch { outro = {}; }
        const velho = agora() - antes.mtimeMs > maxIdade;
        const morto = Number.isInteger(outro.pid) && outro.pid > 0 && !existe(outro.pid);
        if (!velho && !morto) throw new Error('Renovação Supabase em andamento; aguarde o outro upload e tente novamente.');
        // Só remove a mesma instância inspecionada, nunca uma trava renovada.
        const atual = statSync(lock);
        if (atual.ino === antes.ino && atual.mtimeMs === antes.mtimeMs && readFileSync(lock, 'utf8') === conteudo) unlinkSync(lock);
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  }
  throw new Error('Renovação Supabase em andamento; tente novamente.');
}

export async function renovarSessao({ base, key, token }, config, request = fetch,
  { arquivoSessao = resolve(RAIZ, ".supabase-session.json") } = {}) {
  const lock = `${arquivoSessao}.lock`;
  const trava = adquirirTrava(lock);
  let temporario;
  try {
    let anterior;
    if (existsSync(arquivoSessao)) {
      try { anterior = JSON.parse(readFileSync(arquivoSessao, "utf8")); }
      catch { throw new Error("Cache da sessão Supabase inválido; faça novo login e remova .supabase-session.json."); }
      if (anterior.base !== base || typeof anterior.refreshToken !== "string" || !anterior.refreshToken || !anterior.userId) {
        throw new Error("Cache Supabase pertence a outro projeto ou está incompleto; faça novo login e remova .supabase-session.json.");
      }
    }
    const esperado = token ? usuarioToken(token).sub : anterior?.userId;
    if (anterior && esperado !== anterior.userId) throw new Error("Cache Supabase pertence a outro usuário; faça novo login e remova .supabase-session.json.");
    const refreshToken = anterior?.refreshToken || config.SUPABASE_STORAGE_REFRESH_TOKEN;
    if (!refreshToken) throw new Error("Falta SUPABASE_STORAGE_REFRESH_TOKEN: obtenha a sessão do usuário dedicado antes de enviar mídia.");
    let resposta;
    try {
      resposta = await request(`${base}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(120000), headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch { throw new Error("Falha de conexão ao renovar a sessão Supabase; nenhuma mídia foi enviada."); }
    if (!resposta.ok) throw new Error(`Renovação Supabase falhou (HTTP ${resposta.status}); faça novo login do usuário dedicado. Nenhuma mídia foi enviada.`);
    let sessao;
    try { sessao = await resposta.json(); }
    catch { throw new Error("Resposta de renovação Supabase inválida."); }
    if (!sessao || typeof sessao !== "object") throw new Error("Resposta de renovação Supabase inválida.");
    const usuario = usuarioToken(sessao.access_token);
    if ((esperado && usuario.sub !== esperado) || sessao.user?.id !== usuario.sub) {
      throw new Error("A sessão renovada não corresponde ao usuário dedicado esperado.");
    }
    if (!Number.isFinite(usuario.exp) || usuario.exp * 1000 <= Date.now() || typeof sessao.refresh_token !== "string" || !sessao.refresh_token) {
      throw new Error("Renovação Supabase não retornou uma sessão válida com refresh token.");
    }
    // Persistir ANTES de subir a mídia: falhas de upload não perdem a rotação.
    if (!trava.conferir()) throw new Error('Trava Supabase substituída durante renovação; nenhuma mídia foi enviada.');
    temporario = `${arquivoSessao}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporario, JSON.stringify({ base, userId: usuario.sub, refreshToken: sessao.refresh_token }) + "\n", { mode: 0o600, flag: "wx" });
      renameSync(temporario, arquivoSessao);
      temporario = undefined;
    } catch { throw new Error("Não foi possível salvar a sessão Supabase renovada; nenhuma mídia foi enviada."); }
    return sessao.access_token;
  } finally {
    if (temporario && existsSync(temporario)) unlinkSync(temporario);
    trava.liberar();
  }
}
