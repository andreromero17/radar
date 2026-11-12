import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Col, Row, Spinner } from 'react-bootstrap';
import type { DadosFonte } from '@frame/shared';
import { api, errorMessage } from '../../lib/api';
import { estaOculto, formatar, montarLink, ordenar, parteDe, type PrefPainel, type WidgetDef } from '../../lib/paineis';
import { usePreferencia } from '../../lib/preferencias';
import { useOrigem } from '../../lib/voltar';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import StatCard from '../StatCard';
import { GraficoSerie, Ranking, TabelaDados } from './widgets';

interface Props {
  /** Identifica o painel nas preferências do usuário ('painel:<id>') */
  id: string;
  widgets: WidgetDef[];
  /** Período do painel (vai para todas as fontes como ?de=&ate=) */
  de?: string | null;
  ate?: string | null;
  /** Parâmetros extras para todas as fontes */
  params?: Record<string, string>;
  /** Mostra o botão "Personalizar" (padrão: sim) */
  personalizavel?: boolean;
}

type Estado = { dados?: DadosFonte; erro?: string };

/**
 * Painel dirigido por configuração: busca cada fonte uma vez (widgets da mesma fonte compartilham o resultado),
 * desenha os widgets em grid e deixa o usuário ocultar e reordenar ("Personalizar"), guardado no servidor.
 */
export default function PainelWidgets({ id, widgets, de = null, ate = null, params, personalizavel = true }: Props) {
  const { can } = useAuth();
  const toast = useToast();
  const [pref, gravarPref, carregado] = usePreferencia<PrefPainel>(`painel:${id}`);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<PrefPainel | null>(null);
  const [dados, setDados] = useState<Record<string, Estado>>({});

  const permitidos = useMemo(() => widgets.filter((w) => !w.perm || can(w.perm[0], w.perm[1])), [widgets, can]);
  const atual = editando ? rascunho : pref;
  const lista = ordenar(permitidos, atual);
  const visiveis = editando ? lista : lista.filter((w) => !estaOculto(w, atual));

  // uma chamada por fonte + parâmetros
  const chave = (w: WidgetDef) => (w.fonte ? `${w.fonte}?${new URLSearchParams({ ...params, ...w.params })}` : '');
  const chaves = [...new Set(visiveis.map(chave).filter(Boolean))].sort();
  const assinatura = `${de}|${ate}|${chaves.join('&')}`;
  useEffect(() => {
    if (!carregado) return;
    let vivo = true;
    for (const k of chaves) {
      const [fonte, qs] = [k.slice(0, k.indexOf('?')), k.slice(k.indexOf('?') + 1)];
      const q = new URLSearchParams(qs);
      if (de) q.set('de', de);
      if (ate) q.set('ate', ate);
      setDados((d) => ({ ...d, [k]: { dados: d[k]?.dados } }));
      api
        .get<DadosFonte>(`/dados/${fonte}?${q}`)
        .then((r) => vivo && setDados((d) => ({ ...d, [k]: { dados: r } })))
        .catch((e) => vivo && setDados((d) => ({ ...d, [k]: { erro: errorMessage(e) } })));
    }
    return () => {
      vivo = false;
    };
  }, [assinatura, carregado]); // eslint-disable-line react-hooks/exhaustive-deps

  const iniciar = () => {
    setRascunho({
      ocultos: lista.filter((w) => estaOculto(w, pref)).map((w) => w.id),
      ordem: lista.map((w) => w.id),
      mostrados: lista.filter((w) => w.oculto && !estaOculto(w, pref)).map((w) => w.id),
    });
    setEditando(true);
  };
  const alternar = (w: WidgetDef) =>
    setRascunho((r) => {
      if (!r) return r;
      const oculto = estaOculto(w, r);
      return {
        ...r,
        ocultos: oculto ? r.ocultos.filter((x) => x !== w.id) : [...r.ocultos, w.id],
        mostrados: oculto && w.oculto ? [...(r.mostrados ?? []), w.id] : (r.mostrados ?? []).filter((x) => x !== w.id),
      };
    });
  const mover = (w: WidgetDef, delta: number) =>
    setRascunho((r) => {
      if (!r) return r;
      const ordem = lista.map((x) => x.id);
      const i = ordem.indexOf(w.id);
      const j = i + delta;
      if (j < 0 || j >= ordem.length) return r;
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
      return { ...r, ordem };
    });
  const concluir = async () => {
    try {
      await gravarPref(rascunho);
      setEditando(false);
      toast.success('Painel salvo');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const restaurar = async () => {
    try {
      await gravarPref(null);
      setEditando(false);
      toast.success('Painel restaurado ao padrão');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (!carregado)
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );

  return (
    <div className={editando ? 'painel-personalizando' : undefined}>
      {editando && (
        <Card className="card-app painel-barra mb-3 nao-imprimir">
          <Card.Body className="d-flex flex-wrap align-items-center gap-2 py-2">
            <i className="bi bi-sliders text-muted" />
            <span className="small flex-grow-1">
              Personalizando: <b>oculte</b> ou <b>mostre</b> com o olho e mude a <b>ordem</b> com as setas.
            </span>
            <Button size="sm" variant="light" className="border" onClick={restaurar}>
              Restaurar padrão
            </Button>
            <Button size="sm" variant="light" className="border" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={concluir}>
              Concluir
            </Button>
          </Card.Body>
        </Card>
      )}
      <Row className="g-3">
        {visiveis.map((w, i) => {
          const oculto = estaOculto(w, atual);
          const larg = w.largura ?? (w.tipo === 'card' ? { sm: 6, xl: 4 } : { lg: 6 });
          return (
            <Col key={w.id} xs={12} {...larg} className={`widget-slot${editando && oculto ? ' oculto' : ''}`}>
              {editando && (
                <div className="widget-ferramentas">
                  <Button
                    size="sm"
                    variant="light"
                    onClick={() => mover(w, -1)}
                    disabled={i === 0}
                    aria-label={`Subir ${w.titulo}`}
                  >
                    <i className="bi bi-arrow-up" />
                  </Button>
                  <Button
                    size="sm"
                    variant="light"
                    onClick={() => mover(w, 1)}
                    disabled={i === visiveis.length - 1}
                    aria-label={`Descer ${w.titulo}`}
                  >
                    <i className="bi bi-arrow-down" />
                  </Button>
                  <Button
                    size="sm"
                    variant={oculto ? 'secondary' : 'light'}
                    onClick={() => alternar(w)}
                    aria-label={oculto ? `Mostrar ${w.titulo}` : `Ocultar ${w.titulo}`}
                    title={oculto ? 'Mostrar' : 'Ocultar'}
                  >
                    <i className={`bi bi-eye${oculto ? '-slash' : ''}`} />
                  </Button>
                </div>
              )}
              <Widget w={w} estado={dados[chave(w)]} de={de} ate={ate} params={{ ...params, ...w.params }} />
            </Col>
          );
        })}
      </Row>
      {personalizavel && !editando && (
        <div className="text-end mt-3 nao-imprimir">
          <Button size="sm" variant="link" className="text-muted text-decoration-none" onClick={iniciar}>
            <i className="bi bi-sliders me-1" />
            Personalizar painel
          </Button>
        </div>
      )}
    </div>
  );
}

function Widget({
  w,
  estado,
  de,
  ate,
  params,
}: {
  w: WidgetDef;
  estado?: Estado;
  de: string | null;
  ate: string | null;
  params: Record<string, string>;
}) {
  const origem = useOrigem();
  const link = montarLink(w.link, de, ate);
  const dados = parteDe(estado?.dados, w.parte);

  if (w.tipo === 'card') {
    const v = dados?.tipo === 'valores' && w.campo ? dados.valores[w.campo] : undefined;
    const nota = dados?.tipo === 'valores' && w.campo ? dados.notas?.[w.campo] : undefined;
    return (
      <StatCard
        label={nota ? `${w.titulo} · ${nota}` : w.titulo}
        icon={w.icone ?? 'bar-chart'}
        color={w.cor}
        value={
          estado?.erro ? '—' : v == null ? null : formatar(v, dados?.tipo === 'valores' ? dados.formato : undefined)
        }
        to={link ?? undefined}
      />
    );
  }

  if (w.tipo === 'componente' && w.semQuadro && w.componente) {
    const C = w.componente;
    return <C de={de} ate={ate} params={params} />;
  }

  let corpo: ReactNode;
  if (w.tipo === 'componente' && w.componente) {
    const C = w.componente;
    corpo = <C de={de} ate={ate} params={params} />;
  } else if (estado?.erro) corpo = <p className="text-muted small mb-0">Não foi possível carregar: {estado.erro}</p>;
  else if (!dados)
    corpo = (
      <div className="text-center py-4">
        <Spinner size="sm" />
      </div>
    );
  else if (w.tipo === 'grafico' && dados.tipo === 'serie')
    corpo = <GraficoSerie dados={dados} tipo={w.grafico} altura={w.altura} rotulo={w.titulo} />;
  else if (w.tipo === 'ranking' && dados.tipo === 'ranking')
    corpo = <Ranking dados={dados} max={w.max} vazio={w.vazio} />;
  else if (w.tipo === 'tabela' && dados.tipo === 'tabela') corpo = <TabelaDados dados={dados} vazio={w.vazio} />;
  else corpo = <p className="text-muted small mb-0">Formato de dados não suportado por este widget.</p>;

  const semPadding = w.tipo === 'tabela';
  return (
    <Card className="card-app h-100">
      <Card.Header>
        {w.icone && <i className={`bi bi-${w.icone}`} />} {w.titulo}
        {w.subtitulo && <span className="ms-auto small text-muted fw-normal">{w.subtitulo}</span>}
        {link && (
          <Link to={link} state={origem} className={`${w.subtitulo ? 'ms-2' : 'ms-auto'} small fw-normal`}>
            {w.linkRotulo ?? 'ver tudo'}
          </Link>
        )}
      </Card.Header>
      <Card.Body className={semPadding ? 'p-0' : undefined}>{corpo}</Card.Body>
    </Card>
  );
}
