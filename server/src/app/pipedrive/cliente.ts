// =============================================================================
// Cliente mínimo da API do Pipedrive (v2 para organizações e pessoas; v1 para campos e usuários).
// Token em PIPEDRIVE_API_TOKEN (.env) — nunca em log nem em resposta da API.
// O contexto (fetch, ambiente) é trocável nos testes: nunca chamar a rede nos testes.
// =============================================================================

export interface ContextoPipedrive {
  fetch: typeof globalThis.fetch;
  env: Record<string, string | undefined>;
}

const contextoPadrao = (): ContextoPipedrive => ({ fetch: globalThis.fetch.bind(globalThis), env: process.env });
let fabrica = contextoPadrao;
/** Só para testes: troca o fetch/ambiente */
export const definirContextoPipedrive = (f: (() => ContextoPipedrive) | null) => {
  fabrica = f ?? contextoPadrao;
};

export const pipedriveConfigurado = () => !!fabrica().env.PIPEDRIVE_API_TOKEN;

export class ErroPipedrive extends Error {}

export function clientePipedrive() {
  const ctx = fabrica();
  const token = ctx.env.PIPEDRIVE_API_TOKEN;
  if (!token) throw new ErroPipedrive('PIPEDRIVE_API_TOKEN não está no .env do servidor.');
  const dominio = (ctx.env.PIPEDRIVE_DOMINIO || 'api').trim().replace(/\.pipedrive\.com.*$/i, '');
  // o domínio da empresa é opcional: se não responder (nome errado), cai no endereço geral da API
  let base = `https://${dominio}.pipedrive.com`;

  async function get<T>(caminho: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
    const headers = { 'x-api-token': token!, accept: 'application/json' };
    let res: Response;
    try {
      res = await ctx.fetch(`${base}${caminho}${qs.size ? `?${qs}` : ''}`, { headers });
    } catch (e) {
      if (base === 'https://api.pipedrive.com')
        throw new ErroPipedrive(`Não consegui acessar o Pipedrive: ${String(e)}`);
      base = 'https://api.pipedrive.com';
      res = await ctx.fetch(`${base}${caminho}${qs.size ? `?${qs}` : ''}`, { headers });
    }
    if (res.status === 401) throw new ErroPipedrive('O Pipedrive recusou o token (PIPEDRIVE_API_TOKEN).');
    if (!res.ok) throw new ErroPipedrive(`Pipedrive respondeu ${res.status} em ${caminho}.`);
    const corpo = (await res.json()) as { success?: boolean; error?: string } & T;
    if (corpo.success === false) throw new ErroPipedrive(`Pipedrive: ${corpo.error ?? 'erro'} em ${caminho}.`);
    return corpo;
  }

  /** Todas as páginas de um endpoint v2 (cursor) */
  async function todosV2<T>(caminho: string, params: Record<string, string | number | undefined>): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let pagina = 0; pagina < 200; pagina++) {
      const r = await get<{ data: T[] | null; additional_data?: { next_cursor?: string | null } }>(caminho, {
        ...params,
        limit: 500,
        cursor,
      });
      out.push(...(r.data ?? []));
      cursor = r.additional_data?.next_cursor ?? undefined;
      if (!cursor) break;
    }
    return out;
  }

  return { get, todosV2 };
}
