// =============================================================================
// Cliente mínimo da API do Apollo (https://api.apollo.io/api/v1). Chave em APOLLO_API_KEY (.env) — CHAVE MESTRA,
// porque a busca de pessoas exige — nunca em log nem em resposta da API.
// Custos (docs do Apollo): busca de pessoas = 0 crédito; enriquecer empresa = 1 crédito; enriquecer pessoa
// (nome completo e LinkedIn, sem e-mail/telefone) = créditos por pessoa. O Radar nunca pede e-mail nem telefone.
// O contexto (fetch, ambiente) é trocável nos testes: nunca chamar a rede nos testes.
// =============================================================================

export interface ContextoApollo {
  fetch: typeof globalThis.fetch;
  env: Record<string, string | undefined>;
}

const contextoPadrao = (): ContextoApollo => ({ fetch: globalThis.fetch.bind(globalThis), env: process.env });
let fabrica = contextoPadrao;
/** Só para testes: troca o fetch/ambiente */
export const definirContextoApollo = (f: (() => ContextoApollo) | null) => {
  fabrica = f ?? contextoPadrao;
};

export const apolloConfigurado = () => !!fabrica().env.APOLLO_API_KEY;

export class ErroApollo extends Error {}

const BASE = 'https://api.apollo.io/api/v1';

/** Monta a query string no formato do Apollo (listas como `chave[]=a&chave[]=b`) */
function query(params: Record<string, string | number | boolean | (string | number)[] | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    if (Array.isArray(v)) for (const x of v) qs.append(`${k}[]`, String(x));
    else qs.set(k, String(v));
  }
  return qs.size ? `?${qs}` : '';
}

export function clienteApollo() {
  const ctx = fabrica();
  const chave = ctx.env.APOLLO_API_KEY;
  if (!chave) throw new ErroApollo('APOLLO_API_KEY não está no .env do servidor.');

  async function chamar<T>(
    metodo: 'GET' | 'POST',
    caminho: string,
    params: Parameters<typeof query>[0] = {},
    corpo?: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await ctx.fetch(`${BASE}${caminho}${query(params)}`, {
        method: metodo,
        headers: {
          'x-api-key': chave!,
          accept: 'application/json',
          'cache-control': 'no-cache',
          ...(corpo ? { 'content-type': 'application/json' } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      throw new ErroApollo(`Não consegui acessar o Apollo: ${String(e)}`);
    }
    if (res.status === 401) throw new ErroApollo('O Apollo recusou a chave (APOLLO_API_KEY).');
    if (res.status === 403)
      throw new ErroApollo(
        'O Apollo não permitiu esta chamada: confira se a APOLLO_API_KEY é uma chave MESTRA e se o plano inclui a API.',
      );
    if (res.status === 422 || res.status === 402) {
      const msg = await res.text().catch(() => '');
      throw new ErroApollo(
        /credit/i.test(msg) ? 'Sem créditos suficientes no Apollo.' : `O Apollo recusou o pedido (${res.status}).`,
      );
    }
    if (res.status === 429)
      throw new ErroApollo('Limite de chamadas do Apollo atingido; tente de novo em alguns minutos.');
    if (!res.ok) throw new ErroApollo(`Apollo respondeu ${res.status} em ${caminho}.`);
    return (await res.json()) as T;
  }

  return {
    get: <T>(caminho: string, params?: Parameters<typeof query>[0]) => chamar<T>('GET', caminho, params),
    post: <T>(caminho: string, params?: Parameters<typeof query>[0], corpo?: unknown) =>
      chamar<T>('POST', caminho, params, corpo),
  };
}
