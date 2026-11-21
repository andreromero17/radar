import { useEffect, useState } from 'react';
import { Alert, Form, Spinner } from 'react-bootstrap';
import type { VisaoConcorrentes, VisaoContas } from '@frame/shared';
import PageHeader from '../../components/PageHeader';
import { api, errorMessage } from '../../lib/api';
import AbasUniverso from '../components/AbasUniverso';
import SeletorTags from '../components/SeletorTags';
import TagPill from '../components/TagPill';
import { useFiltroTags, useTags } from '../lib/tags';
import { useUniverso } from '../lib/universo';
import VisaoConcorrentesTela from './VisaoConcorrentesTela';
import VisaoContasTela from './VisaoContasTela';

const PERIODOS = [7, 30, 90];

/** Dashboard do Radar: abas Contas-alvo | Concorrentes e a visão geral de cada universo */
export default function VisaoGeral() {
  const [universo, setUniverso] = useUniverso();
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<{ u: string; d: VisaoContas | VisaoConcorrentes } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tags, setTags] = useFiltroTags();
  const { tags: todas, porId } = useTags();
  // ignora no filtro tag que não existe mais
  const filtro = todas ? tags.filter((t) => porId.has(t)) : tags;
  const chaveTags = filtro.join(',');

  useEffect(() => {
    let vivo = true;
    setErro(null);
    api
      .get<VisaoContas | VisaoConcorrentes>(
        `/radar/visao?universo=${encodeURIComponent(universo)}&dias=${dias}&tags=${chaveTags}`,
      )
      .then((d) => vivo && setDados({ u: `${universo}|${chaveTags}`, d }))
      .catch((e) => vivo && setErro(errorMessage(e)));
    return () => {
      vivo = false;
    };
  }, [universo, dias, chaveTags]);

  return (
    <>
      <PageHeader
        title="Visão geral"
        icon="broadcast"
        subtitle={
          universo === 'Concorrente'
            ? 'Concorrentes · o que mudou no mercado'
            : 'Contas-alvo · onde agir nos próximos dias'
        }
      >
        {!!todas?.length && (
          <SeletorTags
            selecionadas={filtro}
            onChange={setTags}
            rotulo={filtro.length ? `Tags (${filtro.length})` : 'Filtrar por tags'}
            podeCriar={false}
          />
        )}
        <Form.Select
          size="sm"
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
          aria-label="Período"
          style={{ width: 'auto' }}
        >
          {PERIODOS.map((p) => (
            <option key={p} value={p}>
              Últimos {p} dias
            </option>
          ))}
        </Form.Select>
      </PageHeader>
      <AbasUniverso universo={universo} onChange={setUniverso} />
      {filtro.length > 0 && (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <span className="small text-muted">Só empresas com:</span>
          {filtro.map((id) => {
            const t = porId.get(id);
            return t ? <TagPill key={id} tag={t} onRemover={() => setTags(filtro.filter((x) => x !== id))} /> : null;
          })}
          <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setTags([])}>
            Limpar
          </button>
        </div>
      )}
      {erro && <Alert variant="danger">{erro}</Alert>}
      {!dados || dados.u !== `${universo}|${chaveTags}` ? (
        !erro && (
          <div className="text-center py-5">
            <Spinner animation="border" size="sm" />
          </div>
        )
      ) : universo === 'Concorrente' ? (
        <VisaoConcorrentesTela d={dados.d as VisaoConcorrentes} />
      ) : (
        <VisaoContasTela d={dados.d as VisaoContas} />
      )}
    </>
  );
}
