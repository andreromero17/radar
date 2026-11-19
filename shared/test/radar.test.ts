import { describe, expect, it } from 'vitest';
import { normalizarLinkedin, rotuloSinal, TIPOS_SINAL } from '../src/app/radar';

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
