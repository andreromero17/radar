import { describe, expect, it } from 'vitest';
import { quando } from '../src/lib/notificacoes';

const local = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;

describe('notificações: quando', () => {
  it('tempo relativo curto', () => {
    const agora = Date.now();
    expect(quando(local(new Date(agora)))).toBe('agora');
    expect(quando(local(new Date(agora - 5 * 60_000)))).toBe('há 5 min');
    expect(quando(local(new Date(agora - 3 * 3_600_000)))).toBe('há 3 h');
    expect(quando('2020-03-07 10:00:00')).toBe('07/03');
  });
});
