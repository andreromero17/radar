// Fontes que o administrador pode escolher (Configurações → Fonte). Testadas com o layout:
// larguras parecidas, acentos completos e pesos de 400 a 700/800.
import type { Fonte, Tema } from '@frame/shared';

interface FonteDef {
  nome: string;
  /** font-family do CSS */
  family: string;
  /** Família e pesos no Google Fonts (vazio = fonte do aparelho, nada a baixar) */
  google?: string;
}

const SISTEMA = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const FONTES_DEF: Record<Exclude<Fonte, 'tema'>, FonteDef> = {
  inter: { nome: 'Inter', family: `'Inter', ${SISTEMA}`, google: 'Inter:wght@400;500;600;700;800' },
  nunito: { nome: 'Nunito', family: `'Nunito', ${SISTEMA}`, google: 'Nunito:wght@400;600;700;800' },
  roboto: { nome: 'Roboto', family: `'Roboto', ${SISTEMA}`, google: 'Roboto:wght@400;500;700;900' },
  'open-sans': { nome: 'Open Sans', family: `'Open Sans', ${SISTEMA}`, google: 'Open+Sans:wght@400;500;600;700;800' },
  lato: { nome: 'Lato', family: `'Lato', ${SISTEMA}`, google: 'Lato:wght@400;700;900' },
  'source-sans': {
    nome: 'Source Sans',
    family: `'Source Sans 3', ${SISTEMA}`,
    google: 'Source+Sans+3:wght@400;500;600;700;800',
  },
  sistema: { nome: 'Do aparelho', family: SISTEMA },
};

/** Fonte padrão de cada tema */
export const FONTE_DO_TEMA: Record<Tema, Exclude<Fonte, 'tema' | 'sistema'>> = {
  vibrante: 'nunito',
  minimalista: 'inter',
};

export const fonteEfetiva = (fonte: Fonte | undefined, tema: Tema | undefined) =>
  !fonte || fonte === 'tema' ? FONTE_DO_TEMA[tema === 'minimalista' ? 'minimalista' : 'vibrante'] : fonte;

const googleUrl = (familias: string[], texto?: string) =>
  `https://fonts.googleapis.com/css2?${familias.map((f) => `family=${f}`).join('&')}&display=swap` +
  (texto ? `&text=${encodeURIComponent(texto)}` : '');

/** Garante um <link> de folha de estilo com o id dado apontando para a URL (ou remove, se vazia) */
function link(id: string, href: string | null) {
  let el = document.getElementById(id) as HTMLLinkElement | null;
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.id = id;
    el.rel = 'stylesheet';
    document.head.appendChild(el);
  }
  if (el.getAttribute('href') !== href) el.href = href;
}

/** Aplica a fonte no documento: baixa só a escolhida e troca a variável --font */
export function applyFonte(fonte: Fonte | undefined, tema: Tema | undefined) {
  const id = fonteEfetiva(fonte, tema);
  const def = FONTES_DEF[id];
  link('fonte-sistema', def.google ? googleUrl([def.google]) : null);
  document.documentElement.style.setProperty('--font', def.family);
  document.documentElement.dataset.fonte = id;
}

export const AMOSTRA = 'Aa Bb 123 R$ 4.567,89 ação';

/** Prévia das fontes na tela de Configurações: baixa só os caracteres da amostra de cada uma */
export function carregarAmostras() {
  const familias = Object.values(FONTES_DEF)
    .map((f) => f.google?.split(':')[0])
    .filter((f): f is string => !!f);
  link(
    'fonte-amostras',
    googleUrl(
      familias,
      AMOSTRA +
        Object.values(FONTES_DEF)
          .map((f) => f.nome)
          .join(''),
    ),
  );
}
