// =============================================================================
// Tarefas diárias em horário fixo (ex.: buscar cotações depois do fechamento da bolsa).
// O sistema registra com `registrarTarefaDiaria` (normalmente em server/src/app/); o boot chama `iniciarAgenda`,
// que confere a cada minuto o que já passou da hora e ainda não rodou hoje (hora local do servidor).
// A manutenção diária do frame continua separada (roda no boot e a cada 24 h, sem hora certa).
// A tarefa roda fora de um espaço: se precisar dos dados de cada espaço, percorra `idsEspacosAtivos()` e use
// `comEspaco(id, fn)`.
// =============================================================================
import type { Logger } from 'pino';
import { nowLocal } from '../utils/time';

export interface TarefaDiaria {
  nome: string;
  /** Horários locais 'HH:MM' em que a tarefa roda (uma vez por dia em cada) */
  horarios: string[];
  executar: () => Promise<unknown>;
}

const tarefas: TarefaDiaria[] = [];
/** `${nome}@${horario}` → última data ('AAAA-MM-DD') em que rodou */
const ultimas = new Map<string, string>();
const rodando = new Set<string>();

export function registrarTarefaDiaria(t: TarefaDiaria) {
  for (const h of t.horarios)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) throw new Error(`Horário inválido na tarefa ${t.nome}: ${h}`);
  const i = tarefas.findIndex((x) => x.nome === t.nome);
  if (i >= 0) tarefas[i] = t;
  else tarefas.push(t);
}

export const tarefasRegistradas = (): readonly TarefaDiaria[] => tarefas;

/**
 * O que está devido em `agora`: horário já passou hoje e a tarefa ainda não rodou hoje nesse horário. Vários
 * horários vencidos da mesma tarefa (ex.: o servidor ficou desligado) contam uma vez só.
 */
export function tarefasDevidas(agora: Date = new Date(), lista: readonly TarefaDiaria[] = tarefas) {
  const [hoje, hora] = nowLocal(agora).split(' ');
  const hhmm = hora.slice(0, 5);
  const devidas: { tarefa: TarefaDiaria; horarios: string[] }[] = [];
  for (const t of lista) {
    const vencidos = t.horarios.filter((h) => h <= hhmm && ultimas.get(`${t.nome}@${h}`) !== hoje);
    if (vencidos.length) devidas.push({ tarefa: t, horarios: vencidos });
  }
  return devidas;
}

/** Roda o que está devido (uma tarefa por vez; a mesma tarefa não roda duas vezes em paralelo) */
export async function rodarDevidas(log?: Pick<Logger, 'info' | 'error'>, agora: Date = new Date()) {
  const hoje = nowLocal(agora).slice(0, 10);
  for (const { tarefa, horarios } of tarefasDevidas(agora)) {
    if (rodando.has(tarefa.nome)) continue;
    rodando.add(tarefa.nome);
    for (const h of horarios) ultimas.set(`${tarefa.nome}@${h}`, hoje);
    try {
      const r = await tarefa.executar();
      log?.info({ tarefa: tarefa.nome, resultado: r }, 'tarefa diária');
    } catch (err) {
      log?.error({ err, tarefa: tarefa.nome }, 'falha na tarefa diária');
    } finally {
      rodando.delete(tarefa.nome);
    }
  }
}

/** Confere a cada minuto (o timer não segura o processo aberto) */
export function iniciarAgenda(log?: Pick<Logger, 'info' | 'error'>, intervaloMs = 60_000) {
  void rodarDevidas(log);
  return setInterval(() => void rodarDevidas(log), intervaloMs).unref();
}

/** Só para testes: esquece o que já rodou e as tarefas registradas */
export function limparAgenda() {
  tarefas.length = 0;
  ultimas.clear();
  rodando.clear();
}
