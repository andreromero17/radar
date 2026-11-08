import { useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Spinner, Table } from 'react-bootstrap';
import type { EntityDef, ImportPreview, ImportResult } from '@frame/shared';
import { api, download, errorMessage } from '../../lib/api';

interface Props {
  show: boolean;
  entity: string;
  ent: EntityDef;
  onHide: () => void;
  /** Chamado depois de importar (recarregar a lista) */
  onDone: () => void;
}

/**
 * Importação em três passos: escolher o arquivo → conferir colunas e prévia → importar.
 * A prévia usa as mesmas validações da gravação; só as linhas válidas são importadas.
 */
export default function ImportModal({ show, entity, ent, onHide, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
  };
  const close = () => {
    if (result?.importados) onDone();
    reset();
    onHide();
  };

  const url = (f: File, mapa?: Record<string, string>, previa = true) =>
    `/${entity}/importar?nome=${encodeURIComponent(f.name)}${previa ? '&previa=1' : ''}${
      mapa ? `&mapa=${encodeURIComponent(JSON.stringify(mapa))}` : ''
    }`;

  const runPreview = async (f: File, mapa?: Record<string, string>) => {
    setBusy(true);
    setError('');
    try {
      setPreview(await api.upload<ImportPreview>(url(f, mapa), f));
    } catch (e) {
      setError(errorMessage(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!file || !preview) return;
    setBusy(true);
    try {
      setResult(await api.upload<ImportResult>(url(file, preview.mapa, false), file));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const mapped = preview ? preview.campos.filter((c) => Object.values(preview.mapa).includes(c.name)) : [];
  const faltando = preview?.campos.filter((c) => c.required && !mapped.includes(c)) ?? [];

  return (
    <Modal show={show} onHide={close} size="xl" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title className="fs-5 fw-bold">
          <i className="bi bi-upload me-2" />
          Importar {ent.label.toLowerCase()}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}

        {result ? (
          <>
            <Alert variant={result.erros.length ? 'warning' : 'success'}>
              <b>{result.importados}</b> registro(s) importado(s).
              {result.erros.length > 0 && ` ${result.erros.length} linha(s) ficaram de fora:`}
            </Alert>
            {result.erros.length > 0 && (
              <Table size="sm" className="small">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Problema</th>
                  </tr>
                </thead>
                <tbody>
                  {result.erros.slice(0, 100).map((e) => (
                    <tr key={e.linha}>
                      <td>{e.linha}</td>
                      <td>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        ) : !preview ? (
          <>
            <p>
              Envie uma planilha <b>.xlsx</b> ou um arquivo <b>.csv</b> com uma linha de cabeçalho. As colunas são
              ligadas aos campos pelo nome; você confere tudo antes de importar.
            </p>
            <Form.Control
              type="file"
              accept=".csv,.txt,.xlsx"
              disabled={busy}
              onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (!f) return;
                setFile(f);
                runPreview(f);
              }}
            />
            <Button variant="link" className="px-0 mt-2" onClick={() => download(`/${entity}/importar/modelo`)}>
              <i className="bi bi-file-earmark-excel me-1" />
              Baixar planilha modelo (com instruções de preenchimento)
            </Button>
            {busy && (
              <div className="text-muted mt-2">
                <Spinner size="sm" /> Lendo o arquivo...
              </div>
            )}
          </>
        ) : (
          <>
            <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
              <span className="fw-semibold">{file?.name}</span>
              <Badge bg="light" text="dark">
                {preview.total} linha(s)
              </Badge>
              <Badge bg="success">{preview.validas} pronta(s)</Badge>
              {preview.invalidas > 0 && <Badge bg="danger">{preview.invalidas} com erro</Badge>}
              <Button variant="link" size="sm" className="ms-auto" onClick={reset}>
                Trocar arquivo
              </Button>
            </div>

            <h6 className="fw-bold small text-uppercase text-muted">Colunas do arquivo → campos</h6>
            <div className="import-map mb-3">
              {preview.colunas.map((col) => (
                <div key={col} className="import-map-item">
                  <span className="text-truncate" title={col}>
                    {col}
                  </span>
                  <i className="bi bi-arrow-right text-muted" />
                  <Form.Select
                    size="sm"
                    value={preview.mapa[col] ?? ''}
                    disabled={busy}
                    aria-label={`Campo para a coluna ${col}`}
                    onChange={(e) => file && runPreview(file, { ...preview.mapa, [col]: e.target.value })}
                  >
                    <option value="">— ignorar —</option>
                    {preview.campos.map((c) => (
                      <option
                        key={c.name}
                        value={c.name}
                        disabled={preview.mapa[col] !== c.name && Object.values(preview.mapa).includes(c.name)}
                      >
                        {c.label}
                        {c.required ? ' *' : ''}
                      </option>
                    ))}
                  </Form.Select>
                </div>
              ))}
            </div>
            {faltando.length > 0 && (
              <Alert variant="warning" className="small py-2">
                Campos obrigatórios sem coluna: {faltando.map((c) => c.label).join(', ')}
              </Alert>
            )}

            <h6 className="fw-bold small text-uppercase text-muted">
              Prévia {preview.total > preview.linhas.length && `(primeiras ${preview.linhas.length})`}
            </h6>
            <div className="table-responsive import-preview">
              <Table size="sm" className="small mb-0">
                <thead>
                  <tr>
                    <th>Linha</th>
                    {mapped.map((c) => (
                      <th key={c.name}>{c.label}</th>
                    ))}
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.linhas.map((l) => {
                    const erros = Object.entries(l.erros);
                    return (
                      <tr key={l.linha} className={erros.length ? 'table-danger' : undefined}>
                        <td className="text-muted">{l.linha}</td>
                        {mapped.map((c) => (
                          <td key={c.name} className={l.erros[c.name] ? 'text-danger fw-semibold' : undefined}>
                            {l.valores[c.name] ?? ''}
                          </td>
                        ))}
                        <td>
                          {erros.length ? (
                            erros.map(([k, m]) => (
                              <div key={k}>
                                {preview.campos.find((c) => c.name === k)?.label ?? k}: {m}
                              </div>
                            ))
                          ) : (
                            <i className="bi bi-check-circle-fill text-success" aria-label="ok" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={close}>
          {result ? 'Fechar' : 'Cancelar'}
        </Button>
        {preview && !result && (
          <Button onClick={runImport} disabled={busy || preview.validas === 0}>
            {busy ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-check-lg me-1" />}
            Importar {preview.validas} linha(s)
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
