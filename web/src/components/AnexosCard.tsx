import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Spinner } from 'react-bootstrap';
import type { Anexo } from '@frame/shared';
import { api, download, errorMessage } from '../lib/api';
import { fmtBytes, fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import ConfirmModal from './ConfirmModal';

interface Props {
  entity: string;
  id: number | string;
  /** Pode incluir/excluir (permissão de editar e registro fora da lixeira) */
  canEdit: boolean;
}

const ICONS: [RegExp, string][] = [
  [/pdf/, 'file-earmark-pdf text-danger'],
  [/^image\//, 'file-earmark-image text-primary'],
  [/sheet|excel|csv/, 'file-earmark-spreadsheet text-success'],
  [/word|document|text/, 'file-earmark-text'],
  [/zip/, 'file-earmark-zip'],
];
const iconOf = (tipo: string) => ICONS.find(([re]) => re.test(tipo))?.[1] ?? 'file-earmark';
const INLINE = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)$/;

/** Lista de arquivos do registro, com envio por botão ou arrastando para a área */
export default function AnexosCard({ entity, id, canEdit }: Props) {
  const toast = useToast();
  const [anexos, setAnexos] = useState<Anexo[] | null>(null);
  const [sending, setSending] = useState(0);
  const [drag, setDrag] = useState(false);
  const [toDelete, setToDelete] = useState<Anexo | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const base = `/${entity}/${id}/anexos`;

  const load = useCallback(
    () =>
      api
        .get<Anexo[]>(base)
        .then(setAnexos)
        .catch((e) => toast.error(errorMessage(e))),
    [base, toast],
  );
  useEffect(() => {
    load();
  }, [load]);

  const send = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setSending((n) => n + list.length);
    for (const file of list) {
      try {
        await api.upload(`${base}?nome=${encodeURIComponent(file.name)}`, file);
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      } finally {
        setSending((n) => n - 1);
      }
    }
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.del(`${base}/${toDelete.id}`);
      toast.success('Anexo excluído');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setToDelete(null);
    }
  };

  return (
    <Card className="card-app mt-3">
      <Card.Header>
        <i className="bi bi-paperclip" /> Anexos
        {anexos && anexos.length > 0 && (
          <span className="badge rounded-pill bg-body-secondary text-body">{anexos.length}</span>
        )}
        {canEdit && (
          <Button size="sm" variant="light" className="border ms-auto" onClick={() => input.current?.click()}>
            <i className="bi bi-upload me-1" /> Enviar arquivo
          </Button>
        )}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) send(e.target.files);
            e.target.value = '';
          }}
        />
      </Card.Header>
      <Card.Body
        className={`p-0 anexos-body${drag ? ' dragging' : ''}`}
        onDragOver={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setDrag(false);
          send(e.dataTransfer.files);
        }}
      >
        {anexos === null ? (
          <div className="text-center py-4">
            <Spinner size="sm" />
          </div>
        ) : (
          <ul className="list-unstyled mb-0 anexos-list">
            {anexos.map((a) => (
              <li key={a.id}>
                <i className={`bi bi-${iconOf(a.tipo)} fs-4`} />
                <div className="flex-grow-1 min-w-0">
                  {INLINE.test(a.tipo) ? (
                    <a href={`/api${base}/${a.id}?inline=1`} target="_blank" rel="noopener" className="fw-semibold">
                      {a.nome}
                    </a>
                  ) : (
                    <span className="fw-semibold">{a.nome}</span>
                  )}
                  <div className="small text-muted">
                    {fmtBytes(a.tamanho)} · {fmtDate(a.criado_em, true)}
                    {a.usuario_nome && ` · ${a.usuario_nome}`}
                  </div>
                </div>
                <Button size="sm" variant="light" title="Baixar" onClick={() => download(`${base}/${a.id}`)}>
                  <i className="bi bi-download" />
                </Button>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="light"
                    className="text-danger"
                    title="Excluir"
                    onClick={() => setToDelete(a)}
                  >
                    <i className="bi bi-trash" />
                  </Button>
                )}
              </li>
            ))}
            {sending > 0 && (
              <li className="text-muted">
                <Spinner size="sm" /> Enviando {sending} arquivo(s)...
              </li>
            )}
            {anexos.length === 0 && sending === 0 && (
              <li className="text-muted justify-content-center py-4">
                {canEdit ? 'Nenhum anexo. Arraste arquivos para cá ou use “Enviar arquivo”.' : 'Nenhum anexo.'}
              </li>
            )}
          </ul>
        )}
      </Card.Body>
      <ConfirmModal
        show={!!toDelete}
        title="Excluir anexo"
        message={
          <>
            Excluir <b>{toDelete?.nome}</b>? O arquivo será apagado.
          </>
        }
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
