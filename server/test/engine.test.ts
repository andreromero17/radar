import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entities } from '@frame/shared';
import { demoEntities } from '@frame/shared/demo';
import { computeDiff, createEntityTable } from '../src/db/diff';
import { setupDemo } from '../src/demo/setup';
import { purgeTrash } from '../src/services/records';
import { makeTestApp, type TestCtx } from './helpers';

// Motor genérico (Fase 2A) testado com o módulo de demonstração
let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
  await setupDemo(ctx.db);
});
afterAll(() => ctx.db.destroy());

const sumDb = async (table: string, col: string, where: (q: ReturnType<TestCtx['db']>) => void) => {
  const q = ctx.db(table).whereNull('excluido_em');
  where(q);
  const r = (await q.sum({ s: col }).first()) as { s: number };
  return Math.round(Number(r.s) * 100) / 100;
};

describe('listagem: filtros, período, ordenação e totais', () => {
  it('período (data__de/__ate) com total da coluna sobre todos os filtrados', async () => {
    const { body } = await ctx.admin.get('/api/demo_movimentos?data__de=2000-01-01&data__ate=2999-12-31&pageSize=5');
    expect(body.rows).toHaveLength(5);
    expect(body.total).toBe(96);
    expect(body.totais.valor).toBe(await sumDb('demo_movimentos', 'valor', () => {}));

    const mes = new Date().toISOString().slice(0, 7);
    const doMes = await ctx.admin.get(`/api/demo_movimentos?data__de=${mes}-01&data__ate=${mes}-31&pageSize=100`);
    expect(doMes.body.rows.every((r: { data: string }) => r.data.startsWith(mes))).toBe(true);
    expect(doMes.body.totais.valor).toBe(
      await sumDb('demo_movimentos', 'valor', (q) => q.whereBetween('data', [`${mes}-01`, `${mes}-31`])),
    );
  });

  it('filtro por vários valores, multiselect (contém), texto e intervalo numérico', async () => {
    const tipos = await ctx.admin.get('/api/demo_movimentos?forma=Pix&forma=Boleto&pageSize=200');
    expect(new Set(tipos.body.rows.map((r: { forma: string }) => r.forma))).toEqual(new Set(['Pix', 'Boleto']));

    const vip = await ctx.admin.get('/api/demo_clientes?tags=VIP&pageSize=50');
    expect(vip.body.rows.every((r: { tags: string[] }) => r.tags.includes('VIP'))).toBe(true);
    expect(vip.body.total).toBe(4);

    const contem = await ctx.admin.get('/api/demo_clientes?nome__contem=mercado');
    expect(contem.body.rows.map((r: { nome: string }) => r.nome)).toEqual(['Mercado Bom Preço']);

    const faixa = await ctx.admin.get('/api/demo_clientes?limite__de=10000&limite__ate=20000');
    expect(faixa.body.rows.every((r: { limite: number }) => r.limite >= 10000 && r.limite <= 20000)).toBe(true);
  });

  it('ordena relação pelo nome e respeita a ordenação padrão da entidade', async () => {
    const asc = await ctx.admin.get('/api/demo_movimentos?sort=categoria_id&dir=asc&pageSize=200');
    const labels = asc.body.rows.map((r: { categoria_id__label: string }) => r.categoria_id__label);
    expect(labels).toEqual([...labels].sort((a: string, b: string) => a.localeCompare(b)));

    const padrao = await ctx.admin.get('/api/demo_clientes?pageSize=3');
    expect(padrao.body.rows.map((r: { nome: string }) => r.nome)).toEqual([
      'Ana Beatriz Costa',
      'Carlos Eduardo Lima',
      'Construtora Horizonte',
    ]);
  });

  it('JSON de multiselect sai como lista', async () => {
    const { body } = await ctx.admin.get('/api/demo_clientes/5');
    expect(body.tags).toEqual(['VIP', 'Atacado']);
  });
});

describe('tipos de campo pela API', () => {
  it('normaliza máscaras e rejeita documentos inválidos', async () => {
    const ok = await ctx.admin.post('/api/demo_clientes').send({
      nome: 'Teste',
      documento: '52998224725',
      telefone: '51988887777',
      tags: ['Novo'],
      limite: '1.500,00',
      desconto: '7,5',
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      documento: '529.982.247-25',
      telefone: '(51) 98888-7777',
      tags: ['Novo'],
      limite: 1500,
      desconto: 7.5,
    });

    const ruim = await ctx.admin
      .post('/api/demo_clientes')
      .send({ nome: 'X', documento: '111.111.111-11', desconto: 120 });
    expect(ruim.body.errors).toMatchObject({ documento: 'CPF/CNPJ inválido', desconto: 'Máximo: 100%' });
  });
});

describe('selects dependentes', () => {
  it('opções filtradas pelo campo do qual dependem', async () => {
    const { body } = await ctx.admin.get('/api/demo_categorias/opcoes?tipo=Receita');
    expect(body.map((o: { label: string }) => o.label)).toEqual(['Rendimentos', 'Salário', 'Vendas']);
  });

  it('servidor rejeita combinação incompatível e relação inexistente', async () => {
    const base = { descricao: 'X', data: '2026-11-08', valor: '10,00' };
    const incompat = await ctx.admin.post('/api/demo_movimentos').send({ ...base, tipo: 'Receita', categoria_id: 4 });
    expect(incompat.body.errors.categoria_id).toBe('Não combina com o campo Tipo');
    const inexist = await ctx.admin.post('/api/demo_movimentos').send({ ...base, tipo: 'Despesa', categoria_id: 999 });
    expect(inexist.body.errors.categoria_id).toBe('Registro selecionado não existe');
    const certo = await ctx.admin.post('/api/demo_movimentos').send({ ...base, tipo: 'Despesa', categoria_id: 4 });
    expect(certo.status).toBe(201);
    expect(certo.body.codigo).toMatch(/^MOV\d{8}-/);
  });

  it('mudar só o campo pai também é validado', async () => {
    const r = await ctx.admin.put('/api/demo_movimentos/1').send({ tipo: 'Receita' });
    const cat = await ctx.db('demo_movimentos').where({ id: 1 }).first();
    const tipoCat = (await ctx.db('demo_categorias').where({ id: cat.categoria_id }).first()).tipo;
    if (tipoCat === 'Receita') expect(r.status).toBe(200);
    else expect(r.body.errors.categoria_id).toBe('Não combina com o campo Tipo');
  });
});

describe('lixeira', () => {
  it('excluir manda para a lixeira; some da lista e das opções; restaura', async () => {
    const del = await ctx.admin.delete('/api/demo_clientes/2');
    expect(del.body).toEqual({ lixeira: true });
    const lista = await ctx.admin.get('/api/demo_clientes?pageSize=100');
    expect(lista.body.rows.some((r: { id: number }) => r.id === 2)).toBe(false);
    const opcoes = await ctx.admin.get('/api/demo_clientes/opcoes');
    expect(opcoes.body.some((o: { value: number }) => o.value === 2)).toBe(false);
    const comAtual = await ctx.admin.get('/api/demo_clientes/opcoes?incluir=2');
    expect(comAtual.body.some((o: { value: number }) => o.value === 2)).toBe(true);

    const lixeira = await ctx.admin.get('/api/demo_clientes?lixeira=1');
    expect(lixeira.body.rows.map((r: { id: number }) => r.id)).toEqual([2]);
    expect((await ctx.admin.put('/api/demo_clientes/2').send({ nome: 'X' })).status).toBe(409);

    await ctx.admin.post('/api/demo_clientes/2/restaurar').expect(200);
    expect((await ctx.admin.get('/api/demo_clientes?lixeira=1')).body.total).toBe(0);

    const logs = await ctx.db('logs').where({ entidade: 'demo_clientes', registro_id: 2 }).pluck('acao');
    expect(logs).toEqual(expect.arrayContaining(['enviado à lixeira', 'restauração']));
  });

  it('exclusão definitiva só para quem já está na lixeira', async () => {
    expect((await ctx.admin.delete('/api/demo_clientes/3?definitivo=1')).status).toBe(409);
    await ctx.admin.delete('/api/demo_clientes/3');
    expect((await ctx.admin.delete('/api/demo_clientes/3?definitivo=1')).status).toBe(204);
    expect(await ctx.db('demo_clientes').where({ id: 3 }).first()).toBeUndefined();
  });

  it('esvaziamento automático respeita o prazo', async () => {
    await ctx.admin.delete('/api/demo_clientes/4');
    expect(await purgeTrash(ctx.db, entities, 30)).toBe(0);
    await ctx.db('demo_clientes').where({ id: 4 }).update({ excluido_em: '2000-01-01 00:00:00' });
    expect(await purgeTrash(ctx.db, entities, 30)).toBe(1);
    expect(await purgeTrash(ctx.db, entities, 0)).toBe(0);
  });

  it('ver a lixeira exige permissão de excluir', async () => {
    expect((await ctx.leitura.get('/api/clientes?lixeira=1')).status).toBe(403);
  });
});

describe('ações em lote', () => {
  it('editar vários de uma vez, com log individual', async () => {
    const r = await ctx.admin
      .post('/api/demo_movimentos/lote')
      .send({ acao: 'editar', ids: [10, 11, 12], dados: { pago: false } });
    expect(r.body).toEqual({ ok: 3, erros: [] });
    expect(
      await ctx.db('demo_movimentos').whereIn('id', [10, 11, 12]).where('pago', 0).count({ n: '*' }).first(),
    ).toEqual({ n: 3 });
  });

  it('erros por registro não interrompem o lote', async () => {
    const r = await ctx.admin.post('/api/demo_movimentos/lote').send({ acao: 'excluir', ids: [20, 99999, 21] });
    expect(r.body.ok).toBe(2);
    expect(r.body.erros).toEqual([{ id: 99999, error: 'Registro não encontrado' }]);
    const restaura = await ctx.admin.post('/api/demo_movimentos/lote').send({ acao: 'restaurar', ids: [20, 21] });
    expect(restaura.body.ok).toBe(2);
  });

  it('valida o pedido e a permissão', async () => {
    expect((await ctx.admin.post('/api/demo_movimentos/lote').send({ acao: 'voar', ids: [1] })).status).toBe(422);
    expect((await ctx.admin.post('/api/demo_movimentos/lote').send({ acao: 'excluir', ids: [] })).status).toBe(422);
    expect((await ctx.leitura.post('/api/chamados/lote').send({ acao: 'excluir', ids: [1] })).status).toBe(403);
  });
});

describe('exportação', () => {
  it('CSV com BOM, ";" e valores como na tela, respeitando filtros e colunas', async () => {
    const res = await ctx.admin
      .get('/api/demo_clientes/exportar?tags=VIP&colunas=nome,tags,limite,ativo')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks).toString('utf8')));
      });
    expect(res.headers['content-disposition']).toMatch(/demo_clientes-\d{4}-\d{2}-\d{2}\.csv/);
    const linhas = (res.body as string).replace(/^\uFEFF/, '').split('\r\n');
    expect((res.body as string).charCodeAt(0)).toBe(0xfeff);
    expect(linhas[0]).toBe('Nome;Etiquetas;Limite de crédito;Ativo');
    expect(linhas).toContain('Ana Beatriz Costa;VIP;500,00;Sim');
    expect(linhas).toHaveLength(5);
  });

  it('XLSX com números reais, formato de moeda e linha de total', async () => {
    const res = await ctx.admin
      .get('/api/demo_movimentos/exportar?formato=xlsx&colunas=descricao,valor')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, 'Descrição', 'Valor']);
    expect(typeof ws.getRow(2).getCell(2).value).toBe('number');
    expect(ws.getColumn(2).numFmt).toContain('R$');
    expect(ws.getRow(ws.rowCount).getCell(1).value).toBe('Total');
  });

  it('nunca exporta senhas', async () => {
    const res = await ctx.admin.get('/api/usuarios/exportar').buffer(true);
    expect(res.text).not.toMatch(/scrypt|Senha/);
  });
});

describe('diff e tabelas com lixeira', () => {
  it('createEntityTable cria a coluna excluido_em e o diff fica em sincronia', async () => {
    const diff = await computeDiff(ctx.db, demoEntities);
    expect(diff.addColumns).toEqual([]);
    expect(diff.orphanColumns).toEqual([]);
    await createEntityTable(ctx.db, 'tmp_x', { ...demoEntities.demo_categorias, lixeira: true });
    expect(Object.keys(await ctx.db('tmp_x').columnInfo())).toContain('excluido_em');
  });
});
