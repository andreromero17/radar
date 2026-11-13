import { useEffect, useState, type FormEvent } from 'react';
import { Button, ButtonGroup, Form, Modal, Spinner, ToggleButton } from 'react-bootstrap';
import { useLocation } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { APP_VERSION } from '../lib/version';

const TIPOS = [
  { id: 'sugestao', rotulo: 'Sugestão', icone: 'lightbulb' },
  { id: 'problema', rotulo: 'Problema', icone: 'bug' },
  { id: 'elogio', rotulo: 'Elogio', icone: 'heart' },
] as const;

/** Enviar feedback (fase de testes): chega no painel da plataforma e por e-mail aos administradores */
export default function FeedbackModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  const toast = useToast();
  const { pathname } = useLocation();
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['id']>('sugestao');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (show) setMensagem('');
  }, [show]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.post('/feedback', { tipo, mensagem, pagina: pathname, versao: APP_VERSION.version });
      toast.success('Obrigado! Seu feedback foi enviado.');
      onHide();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={enviar} noValidate>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5 fw-bold">
            <i className="bi bi-chat-heart me-2" />
            Enviar feedback
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ButtonGroup className="w-100 mb-3">
            {TIPOS.map((t) => (
              <ToggleButton
                key={t.id}
                id={`fb-${t.id}`}
                type="radio"
                variant="light"
                className="border"
                value={t.id}
                checked={tipo === t.id}
                onChange={() => setTipo(t.id)}
              >
                <i className={`bi bi-${t.icone} me-1`} />
                {t.rotulo}
              </ToggleButton>
            ))}
          </ButtonGroup>
          <Form.Control
            as="textarea"
            rows={5}
            maxLength={4000}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder={
              tipo === 'problema'
                ? 'O que aconteceu? O que você esperava? Se puder, diga os passos para repetir.'
                : tipo === 'sugestao'
                  ? 'O que poderia ser melhor ou o que está faltando?'
                  : 'O que você gostou?'
            }
            autoFocus
          />
          <Form.Text>A página em que você está ({pathname}) vai junto, para ajudar a entender.</Form.Text>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={onHide}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando || mensagem.trim().length < 3}>
            {enviando ? <Spinner size="sm" /> : 'Enviar'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
