// Logo da empresa: a imagem (enviada ou baixada do LinkedIn) ou as iniciais numa cor fixa por nome.
import { useState } from 'react';

const iniciais = (nome: string) => {
  const palavras = nome
    .replace(/\b(S\/?A|LTDA|grupo|de|da|do|e)\b\.?/gi, ' ')
    .split(/[\s\-–/&.,]+/)
    .filter((w) => /^\p{L}/u.test(w));
  return ((palavras[0]?.[0] ?? '') + (palavras[1]?.[0] ?? palavras[0]?.[1] ?? '')).toUpperCase() || '?';
};
const serie = (nome: string) => (([...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % 8) + 1).toString();

export default function LogoEmpresa({
  nome,
  logo,
  tamanho = 2,
}: {
  nome: string;
  logo?: string | null;
  tamanho?: number;
}) {
  const [falhou, setFalhou] = useState(false);
  const cor = `var(--serie-${serie(nome)})`;
  const estilo = { width: `${tamanho}rem`, height: `${tamanho}rem`, fontSize: `${tamanho * 0.38}rem` };
  if (logo && !falhou)
    return (
      <span className="radar-logo" style={estilo}>
        <img src={logo} alt={`Logo ${nome}`} onError={() => setFalhou(true)} />
      </span>
    );
  return (
    <span
      className="radar-logo"
      role="img"
      aria-label={`Logo ${nome}`}
      style={{ ...estilo, color: cor, background: `color-mix(in srgb, ${cor} 14%, var(--surface))` }}
    >
      {iniciais(nome)}
    </span>
  );
}
