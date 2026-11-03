/** Renovação de sessão Auth com rotação persistida, sem credenciais admin. */
import { closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
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

export async function renovarSessao({ base, key, token }, config, request = fetch,
  { arquivoSessao = resolve(RAIZ, ".supabase-session.json") } = {}) {
  const lock = `${arquivoSessao}.lock`;
  let fd;
  try { fd = openSync(lock, "wx", 0o600); }
  catch (erro) {
    if (erro.code === "EEXIST") throw new Error("Renovação Supabase em andamento; aguarde o outro upload e tente novamente.");
    throw new Error("Não foi possível bloquear o arquivo local de sessão Supabase.");
  }
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
        method: "POST", redirect: "error", headers: { apikey: key, "Content-Type": "application/json" },
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
    temporario = `${arquivoSessao}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporario, JSON.stringify({ base, userId: usuario.sub, refreshToken: sessao.refresh_token }) + "\n", { mode: 0o600, flag: "wx" });
      renameSync(temporario, arquivoSessao);
      temporario = undefined;
    } catch { throw new Error("Não foi possível salvar a sessão Supabase renovada; nenhuma mídia foi enviada."); }
    return sessao.access_token;
  } finally {
    if (temporario && existsSync(temporario)) unlinkSync(temporario);
    closeSync(fd);
    unlinkSync(lock);
  }
}
