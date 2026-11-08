import { STATUS_CHAMADO } from '@frame/shared';
import { nowLocal, protocolo } from '../utils/time';
import { count, toDbValue, type Db } from './knex';

/** Popula o banco com dados de exemplo. Não faz nada se já houver clientes. */
export async function seed(db: Db): Promise<boolean> {
  if ((await count(db('clientes'))) > 0) return false;

  const clientes = [
    ['Cliente Teste Hugo', 'hugo@exemplo.com', '(51) 99999-0001', '123.456.789-00', true],
    ['Novo Cliente de Teste', 'contato@novocliente.com', '(11) 98888-0002', '12.345.678/0001-90', true],
    ['Padaria Bom Dia', 'financeiro@bomdia.com', '(51) 3333-4444', '98.765.432/0001-10', true],
    ['Construtora Horizonte', 'ti@horizonte.com.br', '(11) 3222-1111', '45.678.901/0001-22', true],
    ['Loja Antiga Ltda', 'loja@antiga.com', '(48) 3000-0000', '11.222.333/0001-44', false],
  ] as const;
  const usuarios = [
    ['Usuário Administrador', 'admin@sistema.com', 'Administrador', true],
    ['Ana Souza', 'ana@sistema.com', 'Operador', true],
    ['Bruno Lima', 'bruno@sistema.com', 'Operador', true],
    ['Carla Dias', 'carla@sistema.com', 'Leitura', false],
  ] as const;
  const assuntos = [
    'Teste chamado', 'Novo chamado hoje', 'Chamado abertura teste', 'Chamado teste 2',
    'Erro ao emitir nota fiscal', 'Impressora não conecta', 'Acesso ao sistema bloqueado',
    'Lentidão no relatório mensal', 'Solicitação de novo usuário', 'Backup não executou',
    'Dúvida sobre integração', 'Atualização de cadastro', 'E-mail não sincroniza',
    'Instalação de software', 'Troca de senha', 'Falha na VPN',
  ];
  const prioridades = ['Baixa', 'Média', 'Média', 'Alta', 'Urgente'];
  const agora = nowLocal();

  await db.transaction(async (trx) => {
    await trx('clientes').insert(
      clientes.map(([nome, email, telefone, documento, ativo]) => ({
        nome, email, telefone, documento, ativo: toDbValue(db, ativo), criado_em: agora,
      })),
    );
    await trx('usuarios').insert(
      usuarios.map(([nome, email, perfil, ativo]) => ({ nome, email, perfil, ativo: toDbValue(db, ativo), criado_em: agora })),
    );

    const now = Date.now();
    const chamados = Array.from({ length: 40 }, (_, i) => {
      // distribui nos últimos ~45 dias, mais recentes no fim
      const date = new Date(now - (40 - i) * 26 * 3_600_000);
      return {
        protocolo: protocolo(date),
        assunto: assuntos[i % assuntos.length],
        prioridade: prioridades[(i * 3) % prioridades.length],
        cliente_id: (i % 4) + 1,
        responsavel_id: i % 3 === 0 ? null : (i % 3) + 1,
        status: STATUS_CHAMADO[(i * 7) % STATUS_CHAMADO.length],
        descricao: 'Chamado gerado automaticamente para demonstração.',
        criado_em: nowLocal(date),
      };
    });
    await trx('chamados').insert(chamados);
    await trx('logs').insert({ entidade: 'sistema', acao: 'seed', detalhe: 'Banco populado com dados de exemplo', usuario: 'Administrador', criado_em: agora });
  });
  return true;
}
