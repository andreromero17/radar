/**
 * Limitador simples em memória (janela fixa). Suficiente para uma instância.
 * Com várias instâncias atrás de um balanceador, trocar por Redis.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Segundos até liberar, ou 0 se ainda pode tentar */
  blockedFor(key: string): number {
    const h = this.hits.get(key);
    if (!h || h.resetAt <= Date.now()) return 0;
    return h.count >= this.max ? Math.ceil((h.resetAt - Date.now()) / 1000) : 0;
  }

  /** Conta uma tentativa. Retorna os segundos de bloqueio (0 = liberado). */
  hit(key: string): number {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      h.count++;
    }
    if (this.hits.size > 10_000) this.sweep();
    return this.blockedFor(key);
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private sweep() {
    const now = Date.now();
    for (const [k, h] of this.hits) if (h.resetAt <= now) this.hits.delete(k);
  }
}

export const minutes = (sec: number) => Math.max(1, Math.ceil(sec / 60));
