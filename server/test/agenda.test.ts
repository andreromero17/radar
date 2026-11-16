import { afterEach, describe, expect, it } from 'vitest';
import { limparAgenda, registrarTarefaDiaria, rodarDevidas, tarefasDevidas } from '../src/services/agenda';

// Frame 0.24.0: tarefas diárias em horário fixo
const em = (iso: string) => new Date(`${iso}:00`);
afterEach(limparAgenda);

describe('agenda de tarefas diárias', () => {
  it('roda depois do horário, uma vez por dia em cada horário', async () => {
    let n = 0;
    registrarTarefaDiaria({ nome: 'cotacoes', horarios: ['09:30', '19:30'], executar: async () => n++ });
    expect(tarefasDevidas(em('2026-11-16T09:29'))).toEqual([]);
    await rodarDevidas(undefined, em('2026-11-16T09:31'));
    await rodarDevidas(undefined, em('2026-11-16T12:00'));
    expect(n).toBe(1);
    await rodarDevidas(undefined, em('2026-11-16T19:45'));
    expect(n).toBe(2);
    // no dia seguinte, de novo
    await rodarDevidas(undefined, em('2026-11-17T09:30'));
    expect(n).toBe(3);
  });

  it('horários vencidos juntos (servidor desligado) rodam uma vez só', async () => {
    let n = 0;
    registrarTarefaDiaria({ nome: 't', horarios: ['09:30', '19:30'], executar: async () => n++ });
    await rodarDevidas(undefined, em('2026-11-16T22:00'));
    await rodarDevidas(undefined, em('2026-11-16T22:01'));
    expect(n).toBe(1);
  });

  it('falha não derruba a agenda e conta como rodada no dia', async () => {
    const erros: unknown[] = [];
    registrarTarefaDiaria({
      nome: 'quebra',
      horarios: ['08:00'],
      executar: async () => {
        throw new Error('fonte fora do ar');
      },
    });
    await rodarDevidas(
      { info: () => undefined, error: (o: unknown) => erros.push(o) } as never,
      em('2026-11-16T08:00'),
    );
    expect(erros).toHaveLength(1);
    expect(tarefasDevidas(em('2026-11-16T09:00'))).toEqual([]);
  });

  it('recusa horário inválido', () => {
    expect(() => registrarTarefaDiaria({ nome: 'x', horarios: ['25:00'], executar: async () => 0 })).toThrow();
  });
});
