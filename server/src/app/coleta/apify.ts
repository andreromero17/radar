// =============================================================================
// Cliente mínimo da API do Apify: dispara um ator, espera terminar e lê o dataset.
// Token em APIFY_TOKEN (.env), só no cabeçalho Authorization. Contexto trocável nos testes (nunca a rede).
// =============================================================================

export interface ContextoApify {
  fetch: typeof globalThis.fetch;
  env: Record<string, string | undefined>;
  /** Pausa entre consultas do andamento (nos testes, imediata) */
  esperar: (ms: number) => Promise<void>;
}

const contextoPadrao = (): ContextoApify => ({
  fetch: globalThis.fetch.bind(globalThis),
  env: process.env,
  esperar: (ms) => new Promise((r) => setTimeout(r, ms).unref()),
});
let fabrica = contextoPadrao;
/** Só para testes */
export const definirContextoApify = (f: (() => ContextoApify) | null) => {
  fabrica = f ?? contextoPadrao;
};
export const apifyConfigurado = () => !!fabrica().env.APIFY_TOKEN;

export class ErroApify extends Error {}

export interface ExecucaoApify<T> {
  itens: T[];
  custoUsd: number | null;
  runId: string;
}

const BASE = 'https://api.apify.com/v2';
const FINAIS = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

/** Roda o ator (ex.: 'harvestapi~linkedin-company-posts') com a entrada dada e devolve os itens do dataset */
export async function rodarAtor<T>(ator: string, entrada: unknown, limiteMin = 30): Promise<ExecucaoApify<T>> {
  const ctx = fabrica();
  const token = ctx.env.APIFY_TOKEN;
  if (!token) throw new ErroApify('APIFY_TOKEN não está no .env do servidor.');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const json = async <R>(res: Response, onde: string): Promise<R> => {
    if (res.status === 401) throw new ErroApify('O Apify recusou o token (APIFY_TOKEN).');
    if (!res.ok) throw new ErroApify(`Apify respondeu ${res.status} em ${onde}.`);
    return (await res.json()) as R;
  };
  type Run = { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number | null };

  let run = (
    await json<{ data: Run }>(
      await ctx.fetch(`${BASE}/acts/${ator}/runs?waitForFinish=60`, {
        method: 'POST',
        headers,
        body: JSON.stringify(entrada),
      }),
      'iniciar o ator',
    )
  ).data;
  const prazo = Date.now() + limiteMin * 60_000;
  while (!FINAIS.has(run.status)) {
    if (Date.now() > prazo) throw new ErroApify(`O ator não terminou em ${limiteMin} min (run ${run.id}).`);
    await ctx.esperar(5_000);
    run = (
      await json<{ data: Run }>(
        await ctx.fetch(`${BASE}/actor-runs/${run.id}?waitForFinish=60`, { headers }),
        'acompanhar o ator',
      )
    ).data;
  }
  if (run.status !== 'SUCCEEDED') throw new ErroApify(`O ator terminou com status ${run.status} (run ${run.id}).`);
  const itens = await json<T[]>(
    await ctx.fetch(`${BASE}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, { headers }),
    'ler o resultado',
  );
  return { itens, custoUsd: typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null, runId: run.id };
}
