import { useEffect, useState, type FormEvent } from 'react';
import { Button, Form, Modal, Spinner } from 'react-bootstrap';
import { TIPO_ESPACO_LABELS, TIPOS_ESPACO } from '@frame/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { ICONE_TIPO } from '../lib/espacos';

/** Cria um espaço novo (sem `espaco`) ou altera nome/tipo do espaço em uso */
export default function EspacoModal({
  show,
  onHide,
  espaco,
  onSalvo,
}: {
  show: boolean;
  onHide: () => void;
  espaco?: { nome: string; tipo: string };
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('pessoal');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (show) {
      setNome(espaco?.nome ?? '');
      setTipo(espaco?.tipo ?? 'pessoal');
      setErro('');
    }
  }, [show, espaco]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return setErro('Informe o nome');
    setSalvando(true);
    try {
      if (espaco) await api.put('/espaco', { nome, tipo });
      else await api.post('/espacos', { nome, tipo });
      toast.success(espaco ? 'Espaço alterado' : `Espaço "${nome.trim()}" criado`);
      onHide();
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? (err.fields.nome ?? err.message) : errorMessage(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={salvar} noValidate>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5 fw-bold">
            <i className={`bi bi-${espaco ? 'pencil' : 'plus-circle'} me-2`} />
            {espaco ? 'Espaço' : 'Novo espaço'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!espaco && (
            <p className="small text-muted">
              Cada espaço tem os próprios dados, separados dos outros, e os próprios membros. Você será o dono.
            </p>
          )}
          <Form.Group className="mb-3">
            <Form.Label className="small fw-semibold">Nome</Form.Label>
            <Form.Control
              value={nome}
              maxLength={80}
              onChange={(e) => {
                setNome(e.target.value);
                setErro('');
              }}
              isInvalid={!!erro}
              autoFocus
              placeholder="Ex.: Holding da família"
            />
            <Form.Control.Feedback type="invalid">{erro}</Form.Control.Feedback>
          </Form.Group>
          <Form.Label className="small fw-semibold">Tipo</Form.Label>
          <div className="d-flex gap-2">
            {TIPOS_ESPACO.map((t) => (
              <Button
                key={t}
                variant={tipo === t ? 'primary' : 'light'}
                className={`flex-fill ${tipo === t ? '' : 'border'}`}
                onClick={() => setTipo(t)}
                aria-pressed={tipo === t}
              >
                <i className={`bi bi-${ICONE_TIPO[t]} d-block fs-5`} />
                {TIPO_ESPACO_LABELS[t]}
              </Button>
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={onHide}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            {salvando ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-check-lg me-1" />}
            {espaco ? 'Salvar' : 'Criar e entrar'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
