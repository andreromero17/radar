// Fontes de dados, alertas e tarefas diárias do Radar. Chamado no boot e ao montar o app (pode rodar mais de uma vez).
import { registrarTarefaDiaria } from '../services/agenda';
import { sincronizarTodos } from './pipedrive';

export function registrarPaineis() {
  registrarTarefaDiaria({ nome: 'radar.pipedrive', horarios: ['06:30'], executar: sincronizarTodos });
}
