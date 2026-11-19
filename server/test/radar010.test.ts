import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importarPiloto } from '../src/app/services/piloto';
import { makeTestApp, type TestCtx } from './helpers';

// Radar 0.1.0: cadastros do radar e dados do piloto (o seed do espaço de teste já importa o piloto).
let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

describe('dados do piloto', () => {
  it('chegam completos e ligados entre si', async () => {
    const n = async (t: string) => Number((await ctx.db(t).count({ n: '*' }))[0].n);
    expect(await n('empresas')).toBe(47);
    expect(await n('pessoas')).toBe(50);
    expect(await n('sinais')).toBe(88);
    expect(await ctx.db('empresas').where('universo', 'Concorrente').count({ n: '*' })).toEqual([{ n: 10 }]);
    const semEmpresa = await ctx.db('sinais').whereNull('empresa_id').count({ n: '*' });
    expect(Number(semEmpresa[0].n)).toBe(0);
    const polidoro = await ctx
      .db('pessoas as p')
      .join('empresas as e', 'e.id', 'p.empresa_id')
      .where('p.nome', 'Adriano Polidoro')
      .first('e.nome_curto');
    expect(polidoro.nome_curto).toBe('Paraná Banco');
  });

  it('rodar a importação de novo não duplica nada', async () => {
    expect(await importarPiloto(ctx.db)).toEqual({ empresas: 0, pessoas: 0, publicacoes: 0, sinais: 0, alertas: 0 });
  });

  it('traz os três alertas de cadastro do piloto', async () => {
    const tipos = (await ctx.db('alertas_cadastro').orderBy('tipo').pluck('tipo')) as string[];
    expect(tipos).toEqual(['Cadastro duplicado', 'Troca de cargo', 'Troca de empresa']);
  });
});

describe('API dos cadastros', () => {
  it('lista os sinais de severidade alta com o nome da empresa', async () => {
    const res = await ctx.admin.get('/api/sinais?severidade=Alta&pageSize=50').expect(200);
    expect(res.body.total ?? res.body.rows?.length).toBe(11);
    const linha = (res.body.rows ?? res.body.data).find((s: { titulo: string }) =>
      s.titulo.startsWith('Paraná Banco com vagas'),
    );
    expect(linha.empresa_id__label).toBe('PARANA BANCO S/A');
  });

  it('não aceita duas empresas com a mesma página do LinkedIn', async () => {
    const dupla = {
      universo: 'Concorrente',
      nome: 'Taking de novo',
      linkedin_url: 'https://www.linkedin.com/company/taking',
    };
    const res = await ctx.admin.post('/api/empresas').send(dupla).expect(409);
    expect(res.body.error).toContain('Grupo Taking');
  });

  it('grava a página do LinkedIn normalizada e recusa endereço de outro site', async () => {
    const nova = {
      universo: 'Conta-alvo',
      nome: 'Empresa Nova',
      linkedin_url: 'br.linkedin.com/company/Empresa-Nova/?x=1',
    };
    const res = await ctx.admin.post('/api/empresas').send(nova).expect(201);
    expect(res.body.linkedin_url).toBe('https://www.linkedin.com/company/empresa-nova');
    await ctx.admin
      .post('/api/empresas')
      .send({ ...nova, nome: 'Outra', linkedin_url: 'https://exemplo.com' })
      .expect(422);
  });

  it('avaliar um sinal grava situação e avaliação', async () => {
    const s = await ctx.db('sinais').where('severidade', 'Alta').first('id');
    await ctx.admin
      .put(`/api/sinais/${s.id}`)
      .send({ ...(await ctx.admin.get(`/api/sinais/${s.id}`)).body, situacao: 'Tratado', avaliacao: 'Útil' })
      .expect(200);
    expect(await ctx.db('sinais').where('id', s.id).first('situacao', 'avaliacao')).toEqual({
      situacao: 'Tratado',
      avaliacao: 'Útil',
    });
  });
});
