// Seletor de tags (0.4.7), no jeito das etiquetas do Pipedrive: lista com busca e marcação, "+ Criar" com a cor.
// Usado para editar as tags da empresa (salva a cada clique) e como filtro da visão geral (só devolve os ids).
import { useEffect, useState } from 'react';
import { Button, Dropdown, Form, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { CORES_TAG, lerTags, type Tag } from '@frame/shared';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, errorMessage } from '../../lib/api';
import { recarregarTags, useTags } from '../lib/tags';
import TagPill from './TagPill';

export default function SeletorTags({
  selecionadas,
  onChange,
  rotulo,
  podeCriar = true,
  vazio,
}: {
  selecionadas: number[];
  onChange: (ids: number[]) => void | Promise<void>;
  /** Texto do botão; padrão: "Tags" */
  rotulo?: string;
  podeCriar?: boolean;
  /** Mensagem quando ainda não há tags */
  vazio?: string;
}) {
  const { tags } = useTags();
  const { can } = useAuth();
  const toast = useToast();
  const [busca, setBusca] = useState('');
  const [cor, setCor] = useState(CORES_TAG[5]);
  const [criando, setCriando] = useState(false);
  const termo = busca.trim().toLowerCase();
  const visiveis = (tags ?? []).filter((t) => !termo || t.nome.toLowerCase().includes(termo));
  const exata = (tags ?? []).some((t) => t.nome.toLowerCase() === termo);
  const criar = podeCriar && can('tags', 'criar') && !!termo && !exata;

  const alternar = (id: number) =>
    void onChange(selecionadas.includes(id) ? selecionadas.filter((x) => x !== id) : [...selecionadas, id]);

  const novaTag = async () => {
    setCriando(true);
    try {
      const t = await api.post<Tag>('/radar/tags', { nome: busca.trim(), cor });
      await recarregarTags();
      setBusca('');
      await onChange([...selecionadas, t.id]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCriando(false);
    }
  };

  return (
    <Dropdown
      autoClose="outside"
      onToggle={(aberto) => {
        if (aberto) void recarregarTags();
        else setBusca('');
      }}
    >
      <Dropdown.Toggle size="sm" variant="light" className="border">
        <i className="bi bi-tags me-1" />
        {rotulo ?? 'Tags'}
      </Dropdown.Toggle>
      <Dropdown.Menu className="radar-tags-menu p-0">
        <div className="p-2 border-bottom">
          <Form.Control
            size="sm"
            autoFocus
            placeholder={podeCriar ? 'Buscar ou criar tag' : 'Buscar tag'}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && criar) void novaTag();
            }}
          />
        </div>
        {!tags ? (
          <div className="text-center py-2">
            <Spinner size="sm" animation="border" />
          </div>
        ) : (
          <div className="py-1">
            {visiveis.map((t) => (
              <Form.Check
                key={t.id}
                id={`tag-${t.id}`}
                checked={selecionadas.includes(t.id)}
                onChange={() => alternar(t.id)}
                label={
                  <span className="d-inline-flex align-items-center gap-2">
                    <TagPill tag={t} />
                    <span className="small text-muted">{t.empresas ?? 0}</span>
                  </span>
                }
              />
            ))}
            {!visiveis.length && !criar && (
              <div className="small text-muted px-3 py-2">{tags.length ? 'Nenhuma tag encontrada.' : vazio}</div>
            )}
          </div>
        )}
        {criar && (
          <div className="p-2 border-top">
            <div className="radar-cores mb-2">
              {CORES_TAG.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  className={c === cor ? 'on' : ''}
                  style={{ background: c }}
                  onClick={() => setCor(c)}
                />
              ))}
            </div>
            <Button size="sm" className="w-100" disabled={criando} onClick={() => void novaTag()}>
              {criando ? (
                <Spinner size="sm" animation="border" className="me-1" />
              ) : (
                <i className="bi bi-plus-lg me-1" />
              )}
              Criar <TagPill tag={{ nome: busca.trim(), cor }} pequena />
            </Button>
          </div>
        )}
        {can('tags', 'ver') && (
          <div className="border-top px-3 py-2 small">
            <Link to="/tags">Gerenciar tags</Link>
          </div>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}

/** Tags da empresa com o seletor ao lado (salva na hora) */
export function TagsEditaveis({
  empresaId,
  ids,
  carregar,
  onSalvo,
}: {
  empresaId: number;
  ids: number[];
  /** Busca as tags atuais da empresa (formulário, que não as recebe) */
  carregar?: boolean;
  onSalvo?: (ids: number[]) => void;
}) {
  const { porId } = useTags();
  const { can } = useAuth();
  const toast = useToast();
  const [atuais, setAtuais] = useState(ids);
  useEffect(() => {
    if (!carregar) return;
    let vivo = true;
    api
      .get<{ tags?: unknown }>(`/empresas/${empresaId}`)
      .then((r) => vivo && setAtuais(lerTags(r.tags)))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [carregar, empresaId]);
  const salvar = async (novos: number[]) => {
    const antes = atuais;
    setAtuais(novos);
    try {
      await api.put(`/radar/empresas/${empresaId}/tags`, { ids: novos });
      void recarregarTags(); // contagem por tag
      onSalvo?.(novos);
    } catch (e) {
      setAtuais(antes);
      toast.error(errorMessage(e));
    }
  };
  const lista = atuais.map((id) => porId.get(id)).filter((t): t is Tag => !!t);
  const editar = can('empresas', 'editar');
  return (
    <div className="d-flex flex-wrap align-items-center gap-1">
      {lista.map((t) => (
        <TagPill
          key={t.id}
          tag={t}
          onRemover={editar ? () => void salvar(atuais.filter((x) => x !== t.id)) : undefined}
        />
      ))}
      {editar && (
        <SeletorTags
          selecionadas={atuais}
          onChange={salvar}
          rotulo={lista.length ? '' : 'Adicionar tag'}
          vazio="Digite o nome para criar a primeira tag."
        />
      )}
    </div>
  );
}
