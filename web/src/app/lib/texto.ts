// Ajudantes de texto e número das telas do Radar
export const num = (n: number | null | undefined, casas = 1) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Algum dos textos contém o termo (sem diferenciar acento e maiúsculas)? Termo vazio = sim */
export const contem = (termo: string, ...textos: (string | null | undefined)[]) => {
  const t = semAcento(termo.trim());
  return !t || textos.some((x) => semAcento(x ?? '').includes(t));
};
