import { useEffect, useState } from 'react';
import { Alert, Form, Spinner } from 'react-bootstrap';
import type { VisaoConcorrentes, VisaoContas } from '@frame/shared';
import PageHeader from '../../components/PageHeader';
import { api, errorMessage } from '../../lib/api';
import AbasUniverso from '../components/AbasUniverso';
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

  useEffect(() => {
    let vivo = true;
    setErro(null);
    api
      .get<VisaoContas | VisaoConcorrentes>(`/radar/visao?universo=${encodeURIComponent(universo)}&dias=${dias}`)
      .then((d) => vivo && setDados({ u: universo, d }))
      .catch((e) => vivo && setErro(errorMessage(e)));
    return () => {
      vivo = false;
    };
  }, [universo, dias]);

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
      {erro && <Alert variant="danger">{erro}</Alert>}
      {!dados || dados.u !== universo ? (
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
