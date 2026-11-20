import { describe, expect, it } from 'vitest';
import { normalizarLinkedin, rotuloSinal, TIPOS_SINAL } from '../src/app/radar';
import { assuntosDoTexto, classificarAssuntos } from '../src/app/assuntos';

describe('normalizarLinkedin', () => {
  it('padroniza esquema, www, maiúsculas, barra final e querystring', () => {
    expect(normalizarLinkedin('linkedin.com/company/Taking/')).toBe('https://www.linkedin.com/company/taking');
    expect(normalizarLinkedin('https://br.linkedin.com/in/Polidoro/?trk=x')).toBe(
      'https://www.linkedin.com/in/polidoro',
    );
    expect(normalizarLinkedin('http://www.linkedin.com/in/fulano#top')).toBe('https://www.linkedin.com/in/fulano');
  });

  it('decodifica acentos e usa só a primeira URL de uma lista', () => {
    expect(normalizarLinkedin('https://www.linkedin.com/in/andr%C3%A9-vidal/, linkedin.com/in/andré-vidal')).toBe(
      'https://www.linkedin.com/in/andré-vidal',
    );
  });

  it('recusa vazio e endereço fora do LinkedIn', () => {
    expect(normalizarLinkedin('')).toBeNull();
    expect(normalizarLinkedin(null)).toBeNull();
    expect(normalizarLinkedin('https://www.notlinkedin.com/in/x')).toBeNull();
    expect(normalizarLinkedin('https://exemplo.com.br')).toBeNull();
  });
});

describe('tipos de sinal', () => {
  it('traduz o código da classificação para o rótulo das telas', () => {
    expect(rotuloSinal('contratacao_tech')).toBe('Contratação de tecnologia');
    expect(rotuloSinal('oferta_nova')).toBe('Oferta nova');
    expect(rotuloSinal('Já é rótulo')).toBe('Já é rótulo');
  });

  it('não repete rótulos entre os universos', () => {
    expect(new Set(TIPOS_SINAL).size).toBe(TIPOS_SINAL.length);
  });
});

describe('assuntos', () => {
  it('acha os assuntos pelas palavras, sem acento nem maiúscula, até 3', () => {
    expect(classificarAssuntos('Lançamos o AI Symphony, plataforma de IA multimodelo')).toEqual([
      'IA e agentes',
      'Lançamentos e ofertas',
    ]);
    expect(classificarAssuntos('Somos GPTW de novo! #GreatPlaceToWork')).toEqual(['Prêmios e certificações']);
    expect(classificarAssuntos('Estamos contratando: vagas em engenharia de dados')).toContain('Vagas e talentos');
    expect(classificarAssuntos('a data do evento é sexta')).not.toContain('Dados e analytics'); // "data" = dia
    expect(classificarAssuntos('Bom dia')).toEqual(['Outros']);
    expect(classificarAssuntos('ia dados cloud parceria case gptw vaga').length).toBe(3);
  });

  it('lê a lista gravada', () => {
    expect(assuntosDoTexto('IA e agentes; Parcerias')).toEqual(['IA e agentes', 'Parcerias']);
    expect(assuntosDoTexto(null)).toEqual([]);
  });
});
