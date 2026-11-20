// Pessoas sugeridas pelo Apollo (0.4.6): marcar e aprovar (vira pessoa monitorada; consome créditos do Apollo) ou
// descartar. Sem `empresaId`, mostra todas as pendentes agrupadas por empresa.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Spinner, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { AREAS_PESSOA } from '@frame/shared';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage } from '../../lib/api';

export interface Sugestao {
  id: number;
  nome: string;
  cargo: string | null;
  area: string;
  empresa_id: number;
  empresa: string;
  nome_curto: string | null;
}

export default function SugestoesPessoas({ empresaId, versao = 0 }: { empresaId?: number; versao?: number }) {
  const { can } = useAuth();
  const toast = useToast();
  const pode = can('pessoas', 'criar');
  const [lista, setLista] = useState<Sugestao[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [area, setArea] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);

  const carregar = useCallback(() => {
    api
      .get<Sugestao[]>(`/radar/apollo/sugestoes${empresaId ? `?empresa_id=${empresaId}` : ''}`)
      .then((l) => {
        setLista(l);
        setMarcadas(new Set());
      })
      .catch((e) => toast.error(errorMessage(e)));
  }, [empresaId, toast]);
  useEffect(carregar, [carregar, versao]);

  const visiveis = useMemo(() => (lista ?? []).filter((s) => !area || s.area === area), [lista, area]);
  const grupos = useMemo(() => {
    const m = new Map<number, Sugestao[]>();
    for (const s of visiveis) m.set(s.empresa_id, [...(m.get(s.empresa_id) ?? []), s]);
    return [...m.values()];
  }, [visiveis]);

  if (!lista)
    return (
      <div className="text-center py-3">
        <Spinner animation="border" size="sm" />
      </div>
    );
  if (!lista.length)
    return (
      <p className="text-muted small mb-0">
        Nenhuma pessoa sugerida pendente.
        {pode && ' Use "Buscar pessoas" para trazer do Apollo quem trabalha lá (não consome créditos).'}
      </p>
    );

  const alternar = (ids: number[], marcar: boolean) =>
    setMarcadas((m) => {
      const n = new Set(m);
      for (const id of ids) {
        if (marcar) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const todasVisiveis = visiveis.length > 0 && visiveis.every((s) => marcadas.has(s.id));

  const agir = async (acao: 'aprovar' | 'descartar') => {
    const ids = [...marcadas];
    if (
      acao === 'aprovar' &&
      !window.confirm(
        `Cadastrar ${ids.length} pessoa(s) no Radar?\n\nO Apollo cobra créditos por pessoa para trazer o nome completo ` +
          'e o LinkedIn (nunca e-mail nem telefone).',
      )
    )
      return;
    setRodando(true);
    try {
      if (acao === 'aprovar') {
        const r = await api.post<{ cadastradas: number; ja_existiam: number; sem_linkedin: number }>(
          '/radar/apollo/sugestoes/aprovar',
          { ids },
        );
        toast.success(
          `${r.cadastradas} pessoa(s) cadastrada(s)` +
            (r.ja_existiam ? ` · ${r.ja_existiam} já estava(m) no Radar` : '') +
            (r.sem_linkedin ? ` · ${r.sem_linkedin} sem LinkedIn no Apollo (não entram na coleta)` : ''),
        );
      } else {
        const r = await api.post<{ descartadas: number }>('/radar/apollo/sugestoes/descartar', { ids });
        toast.success(`${r.descartadas} sugestão(ões) descartada(s); não voltam nas próximas buscas.`);
      }
      carregar();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRodando(false);
    }
  };

  const contagem = (a: string) => lista.filter((s) => s.area === a).length;

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <button type="button" className={`radar-filtro${!area ? ' on' : ''}`} onClick={() => setArea(null)}>
          Todas ({lista.length})
        </button>
        {AREAS_PESSOA.filter((a) => contagem(a)).map((a) => (
          <button
            key={a}
            type="button"
            className={`radar-filtro${area === a ? ' on' : ''}`}
            onClick={() => setArea(area === a ? null : a)}
          >
            {a} ({contagem(a)})
          </button>
        ))}
        {pode && (
          <div className="ms-auto d-flex gap-2">
            <Button
              size="sm"
              variant="light"
              className="border"
              disabled={!marcadas.size || rodando}
              onClick={() => void agir('descartar')}
            >
              Descartar
            </Button>
            <Button size="sm" disabled={!marcadas.size || rodando} onClick={() => void agir('aprovar')}>
              {rodando ? (
                <Spinner size="sm" animation="border" className="me-1" />
              ) : (
                <i className="bi bi-check2 me-1" />
              )}
              Aprovar {marcadas.size || ''}
            </Button>
          </div>
        )}
      </div>
      <Table responsive hover size="sm" className="table-app mb-0 align-middle">
        <thead>
          <tr>
            {pode && (
              <th style={{ width: '2rem' }}>
                <Form.Check
                  aria-label="Marcar todas"
                  checked={todasVisiveis}
                  onChange={(e) =>
                    alternar(
                      visiveis.map((s) => s.id),
                      e.target.checked,
                    )
                  }
                />
              </th>
            )}
            <th>Nome</th>
            <th>Cargo</th>
            <th>Área</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <GrupoEmpresa
              key={g[0].empresa_id}
              itens={g}
              titulo={empresaId ? null : g[0].nome_curto || g[0].empresa}
              pode={pode}
              marcadas={marcadas}
              alternar={alternar}
            />
          ))}
        </tbody>
      </Table>
      <p className="small text-muted mt-2 mb-0">
        O Apollo mostra o sobrenome abreviado até a aprovação. Aprovar traz o nome completo e o LinkedIn (créditos por
        pessoa) e cadastra a pessoa no Radar, monitorada. Nada vai para o Pipedrive.
      </p>
    </div>
  );
}

function GrupoEmpresa({
  itens,
  titulo,
  pode,
  marcadas,
  alternar,
}: {
  itens: Sugestao[];
  titulo: string | null;
  pode: boolean;
  marcadas: Set<number>;
  alternar: (ids: number[], marcar: boolean) => void;
}) {
  const todas = itens.every((s) => marcadas.has(s.id));
  return (
    <>
      {titulo && (
        <tr className="radar-grupo">
          {pode && (
            <td>
              <Form.Check
                aria-label={`Marcar todas de ${titulo}`}
                checked={todas}
                onChange={(e) =>
                  alternar(
                    itens.map((s) => s.id),
                    e.target.checked,
                  )
                }
              />
            </td>
          )}
          <td colSpan={3} className="fw-semibold">
            <Link to={`/empresa/${itens[0].empresa_id}`} className="text-reset">
              {titulo}
            </Link>{' '}
            <span className="text-muted small">· {itens.length}</span>
          </td>
        </tr>
      )}
      {itens.map((s) => (
        <tr key={s.id}>
          {pode && (
            <td>
              <Form.Check
                aria-label={`Marcar ${s.nome}`}
                checked={marcadas.has(s.id)}
                onChange={(e) => alternar([s.id], e.target.checked)}
              />
            </td>
          )}
          <td>{s.nome}</td>
          <td className="text-muted">{s.cargo ?? '—'}</td>
          <td>
            <span className="radar-chip">{s.area}</span>
          </td>
        </tr>
      ))}
    </>
  );
}
