// Quadro "Apollo" da página da empresa (0.4.6): dados do enriquecimento, botões Enriquecer (1 crédito) e Buscar
// pessoas (sem custo) e as pessoas sugeridas pendentes desta empresa.
import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Spinner } from 'react-bootstrap';
import type { DetalheEmpresa } from '@frame/shared';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage } from '../../lib/api';
import { compacto } from '../lib/universo';
import SugestoesPessoas from './SugestoesPessoas';

type Apollo = DetalheEmpresa['empresa']['apollo'];

export default function ApolloEmpresa({
  empresaId,
  apollo,
  temSite,
  onEnriquecida,
}: {
  empresaId: number;
  apollo: Apollo;
  temSite: boolean;
  onEnriquecida: () => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [rodando, setRodando] = useState<'enriquecer' | 'pessoas' | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    api
      .get<{ configurado: boolean }>('/radar/apollo/status')
      .then((s) => vivo && setConfigurado(s.configurado))
      .catch(() => vivo && setConfigurado(false));
    return () => {
      vivo = false;
    };
  }, []);

  const enriquecer = async () => {
    setRodando('enriquecer');
    try {
      await api.post(`/radar/apollo/empresas/${empresaId}/enriquecer`, {});
      toast.success('Empresa enriquecida com os dados do Apollo.');
      onEnriquecida();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRodando(null);
    }
  };
  const buscar = async () => {
    setRodando('pessoas');
    try {
      const r = await api.post<{ encontradas: number; novas: number; ja_sugeridas: number; fora_do_perfil: number }>(
        `/radar/apollo/empresas/${empresaId}/pessoas`,
        {},
      );
      toast.success(
        `${r.encontradas} pessoa(s) de gestão no Apollo · ${r.novas} nova(s) sugestão(ões)` +
          (r.fora_do_perfil ? ` · ${r.fora_do_perfil} fora das áreas` : '') +
          (r.ja_sugeridas ? ` · ${r.ja_sugeridas} já sugerida(s) antes` : ''),
      );
      setVersao((v) => v + 1);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRodando(null);
    }
  };

  const semChave = configurado === false;
  const dica = semChave
    ? 'Falta a APOLLO_API_KEY no .env do servidor'
    : !temSite
      ? 'Cadastre o site da empresa: o Apollo procura pelo domínio'
      : undefined;
  const item = (rotulo: string, valor: string | number | null) =>
    valor == null || valor === '' ? null : (
      <Col sm={6} lg={4} className="mb-2">
        <div className="small text-muted">{rotulo}</div>
        <div>{valor}</div>
      </Col>
    );

  return (
    <Card className="card-app mb-3">
      <Card.Header className="d-flex flex-wrap align-items-center gap-2">
        <span className="fw-semibold">Apollo</span>
        {apollo && (
          <span className="small text-muted">
            enriquecida em {apollo.enriquecido_em.slice(0, 10).split('-').reverse().join('/')}
          </span>
        )}
        <div className="ms-auto d-flex gap-2" title={dica}>
          {can('empresas', 'editar') && (
            <Button
              size="sm"
              variant="light"
              className="border"
              disabled={!!rodando || semChave || !temSite}
              onClick={() => void enriquecer()}
            >
              {rodando === 'enriquecer' ? (
                <Spinner size="sm" animation="border" className="me-1" />
              ) : (
                <i className="bi bi-stars me-1" />
              )}
              {apollo ? 'Atualizar dados' : 'Enriquecer'} <span className="text-muted">(1 crédito)</span>
            </Button>
          )}
          {can('pessoas', 'criar') && (
            <Button
              size="sm"
              variant="light"
              className="border"
              disabled={!!rodando || semChave || !temSite}
              onClick={() => void buscar()}
            >
              {rodando === 'pessoas' ? (
                <Spinner size="sm" animation="border" className="me-1" />
              ) : (
                <i className="bi bi-person-plus me-1" />
              )}
              Buscar pessoas <span className="text-muted">(sem custo)</span>
            </Button>
          )}
        </div>
      </Card.Header>
      <Card.Body>
        {apollo ? (
          <>
            <Row>
              {item('Funcionários (estimativa)', apollo.funcionarios == null ? null : compacto(apollo.funcionarios))}
              {item('Setor', apollo.setor)}
              {item('Faturamento estimado', apollo.faturamento)}
              {item('Fundação', apollo.fundacao)}
              {item('Sede', apollo.local)}
              {item('Investimento recebido', apollo.investimento)}
            </Row>
            {apollo.descricao && <p className="small mb-2">{apollo.descricao}</p>}
            {apollo.tecnologias && (
              <div className="small mb-3">
                <span className="text-muted">Tecnologias: </span>
                {apollo.tecnologias}
              </div>
            )}
          </>
        ) : (
          <p className="small text-muted">
            Ainda não enriquecida. "Enriquecer" traz funcionários estimados, setor, faturamento, sede, tecnologias e
            descrição.
          </p>
        )}
        <div className="fw-semibold small mb-2">Pessoas sugeridas</div>
        <SugestoesPessoas empresaId={empresaId} versao={versao} />
      </Card.Body>
    </Card>
  );
}
