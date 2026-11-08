// =============================================================================
// Módulo de demonstração (DEMO=true no server/.env): registra os cadastros de
// exemplo, cria as tabelas que faltarem e popula com dados fictícios.
// As tabelas ficam FORA das migrações (prefixo demo_): ligar/desligar a demo
// não interfere no histórico do banco nem no `db:diff`.
// =============================================================================
import { getEntity, maskDocument, registerEntities } from '@frame/shared';
import { demoEntities } from '@frame/shared/demo';
import { createEntityTable } from '../db/diff';
import { count, type Db } from '../db/knex';
import { generateCode, nowLocal } from '../utils/time';

/** Gera CPF/CNPJ válidos a partir de uma base numérica */
function withCheckDigits(base: string, weightsList: number[][]) {
  let d = base;
  for (const w of weightsList) {
    const sum = w.reduce((s, x, i) => s + Number(d[i]) * x, 0);
    const r = sum % 11;
    d += r < 2 ? '0' : String(11 - r);
  }
  return d;
}
const cpf = (n: number) =>
  maskDocument(
    withCheckDigits(String(100000000 + n * 7919).slice(0, 9), [
      [10, 9, 8, 7, 6, 5, 4, 3, 2],
      [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
    ]),
    'cpf',
  );
const cnpj = (n: number) =>
  maskDocument(
    withCheckDigits(`${String(10000000 + n * 104729).slice(0, 8)}0001`, [
      [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
      [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    ]),
    'cnpj',
  );

export function registerDemo() {
  if (!getEntity('demo_clientes')) registerEntities(demoEntities);
}

/** Registra, cria tabelas e popula (só se vazias). Retorna true se populou agora. */
export async function setupDemo(db: Db): Promise<boolean> {
  registerDemo();
  for (const [table, ent] of Object.entries(demoEntities)) {
    if (!(await db.schema.hasTable(table))) await createEntityTable(db, table, ent);
  }
  if ((await count(db('demo_clientes'))) > 0) return false;

  const agora = nowLocal();
  const categorias = [
    ['Salário', 'Receita', '#2b8a5a'],
    ['Vendas', 'Receita', '#0ea5e9'],
    ['Rendimentos', 'Receita', '#7048e8'],
    ['Aluguel', 'Despesa', '#e03e3e'],
    ['Mercado', 'Despesa', '#f08c2e'],
    ['Transporte', 'Despesa', '#a855f7'],
    ['Lazer', 'Despesa', '#db2777'],
    ['Saúde', 'Despesa', '#10b981'],
  ] as const;
  await db('demo_categorias').insert(categorias.map(([nome, tipo, cor]) => ({ nome, tipo, cor, criado_em: agora })));

  const nomes = [
    ['Ana Beatriz Costa', 'Física'],
    ['Padaria Pão Quente', 'Jurídica'],
    ['Carlos Eduardo Lima', 'Física'],
    ['Construtora Horizonte', 'Jurídica'],
    ['Daniela Ferreira', 'Física'],
    ['Mercado Bom Preço', 'Jurídica'],
    ['Eduardo Martins', 'Física'],
    ['Farmácia Saúde Já', 'Jurídica'],
    ['Gabriela Rocha', 'Física'],
    ['Oficina do Zé', 'Jurídica'],
    ['Helena Duarte', 'Física'],
    ['Loja Antiga Ltda', 'Jurídica'],
  ] as const;
  const tagsPor = (i: number) => [['VIP'], ['Atacado'], ['Novo'], [], ['VIP', 'Atacado'], ['Inadimplente']][i % 6];
  await db('demo_clientes').insert(
    nomes.map(([nome, tipo], i) => ({
      nome,
      tipo_pessoa: tipo,
      documento: tipo === 'Física' ? cpf(i + 1) : cnpj(i + 1),
      email: `${nome.split(' ')[0].toLowerCase()}@exemplo.com`,
      telefone: `(51) 9${String(8000_0000 + i * 1371).slice(0, 4)}-${String(1000 + i * 77).slice(0, 4)}`,
      tags: JSON.stringify(tagsPor(i)),
      limite: [500, 15000, 1200, 50000, 800, 20000][i % 6],
      desconto: [0, 5, 2.5, 10, 0, 7.5][i % 6],
      cor: ['#4f6ef7', '#7048e8', '#0ea5e9', '#10b981', '#f08c2e', '#db2777'][i % 6],
      ativo: i === 11 ? 0 : 1,
      criado_em: agora,
    })),
  );

  // ~4 meses de movimentos, do mês retrasado ao próximo
  const cats = await db('demo_categorias').select('id', 'nome', 'tipo');
  const receitas = cats.filter((c) => c.tipo === 'Receita');
  const despesas = cats.filter((c) => c.tipo === 'Despesa');
  const hoje = new Date();
  const movs = [];
  for (let m = -2; m <= 1; m++) {
    for (let k = 0; k < 24; k++) {
      const dia = new Date(hoje.getFullYear(), hoje.getMonth() + m, 1 + ((k * 5) % 28));
      const receita = k % 5 === 0;
      const cat = receita ? receitas[k % receitas.length] : despesas[k % despesas.length];
      const valor = receita ? 1500 + ((k * 731) % 4000) : -(25 + ((k * 397) % 900) + (k % 3) * 0.9);
      movs.push({
        codigo: generateCode('MOV', dia),
        descricao: `${cat.nome} ${k + 1}`,
        data: nowLocal(dia).slice(0, 10),
        tipo: cat.tipo,
        categoria_id: cat.id,
        cliente_id: receita ? (k % 12) + 1 : null,
        valor: Math.round(valor * 100) / 100,
        forma: ['Pix', 'Cartão', 'Boleto', 'Dinheiro'][k % 4],
        pago: m < 0 || (m === 0 && k % 2 === 0) ? 1 : 0,
        criado_em: agora,
      });
    }
  }
  await db.batchInsert('demo_movimentos', movs, 50);
  return true;
}
