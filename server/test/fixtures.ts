// Dados de exemplo dos testes da API (as entidades estão em shared/test/fixtures.ts)
import { hashPassword } from '../src/auth/password';
import type { Db } from '../src/db/knex';
import { generateCode, nowLocal } from '../src/utils/time';
import { STATUS } from '../../shared/test/fixtures';

export { fixtureEntities, registerFixtureEntities } from '../../shared/test/fixtures';

/** Perfis, usuários e registros de exemplo (ids previsíveis para os testes) */
export async function seedFixtures(db: Db) {
  const agora = nowLocal();
  const operador = await db('perfis')
    .insert({
      nome: 'Operador',
      admin: false,
      permissoes: JSON.stringify({
        clientes: ['ver', 'criar', 'editar'],
        chamados: ['ver', 'criar', 'editar', 'excluir'],
      }),
      criado_em: agora,
    })
    .returning('id');
  const leitura = await db('perfis')
    .insert({
      nome: 'Leitura',
      admin: false,
      permissoes: JSON.stringify({ clientes: ['ver'], chamados: ['ver'] }),
      criado_em: agora,
    })
    .returning('id');
  const id = (r: { id: number }[] | number[]) => (typeof r[0] === 'object' ? r[0].id : r[0]);
  const senha = await hashPassword('senha123');
  await db('usuarios').insert([
    {
      nome: 'Ana Souza',
      email: 'ana@sistema.com',
      perfil_id: id(operador),
      senha,
      ativo: 1,
      trocar_senha: 0,
      criado_em: agora,
    },
    {
      nome: 'Bruno Lima',
      email: 'bruno@sistema.com',
      perfil_id: id(leitura),
      senha,
      ativo: 1,
      trocar_senha: 0,
      criado_em: agora,
    },
    {
      nome: 'Carla Dias',
      email: 'carla@sistema.com',
      perfil_id: id(operador),
      senha,
      ativo: 0,
      trocar_senha: 0,
      criado_em: agora,
    },
  ]);
  await db('clientes').insert(
    [
      ['Cliente Teste Hugo', 'hugo@exemplo.com', '(51) 99999-0001', true],
      ['Novo Cliente de Teste', 'contato@novocliente.com', '(11) 98888-0002', true],
      ['Padaria Bom Dia', 'financeiro@bomdia.com', '(51) 3333-4444', true],
      ['Construtora Horizonte', 'ti@horizonte.com.br', '(11) 3222-1111', true],
      ['Loja Antiga Ltda', 'loja@antiga.com', '(48) 3000-0000', false],
    ].map(([nome, email, telefone, ativo]) => ({ nome, email, telefone, ativo: ativo ? 1 : 0, criado_em: agora })),
  );
  await db('chamados').insert(
    Array.from({ length: 40 }, (_, i) => ({
      protocolo: generateCode('CH'),
      assunto: `Chamado ${i + 1}`,
      prioridade: ['Baixa', 'Média', 'Alta', 'Urgente'][i % 4],
      cliente_id: (i % 4) + 1,
      responsavel_id: i % 3 === 0 ? null : (i % 3) + 1,
      status: STATUS[(i * 7) % STATUS.length],
      criado_em: agora,
    })),
  );
}
