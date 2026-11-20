// Fontes de dados, alertas e tarefas diárias do Radar. Chamado no boot e ao montar o app (pode rodar mais de uma vez).
import { registrarTarefaDiaria } from '../services/agenda';
import { coletarTodos } from './coleta';
import { sincronizarTodos } from './pipedrive';

export function registrarPaineis() {
  registrarTarefaDiaria({ nome: 'radar.pipedrive', horarios: ['06:30'], executar: sincronizarTodos });
  registrarTarefaDiaria({ nome: 'radar.coleta', horarios: ['07:00'], executar: coletarTodos });
}
