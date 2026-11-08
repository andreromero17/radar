import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Col, FloatingLabel, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { MAX_LOGO_BYTES, settingsSchema, toFieldErrors, type FieldErrors, type Settings } from '@frame/shared';
import { ApiError, errorMessage } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import BrandMark from './BrandMark';
import ConfirmModal from './ConfirmModal';

const ICONES = [
  'box-seam',
  'wallet2',
  'piggy-bank',
  'graph-up-arrow',
  'briefcase',
  'building',
  'cart3',
  'headset',
  'heart-pulse',
  'mortarboard',
  'truck',
  'lightning-charge',
];

const PALETAS = [
  ['Azul & roxo', '#4f6ef7', '#7b4fd6'],
  ['Oceano', '#0ea5e9', '#2563eb'],
  ['Esmeralda', '#10b981', '#0f766e'],
  ['Laranja', '#f97316', '#db2777'],
  ['Vinho', '#be123c', '#7e22ce'],
  ['Grafite', '#334155', '#0f172a'],
] as const;

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

function ColorField({ label, value, onChange, error }: ColorFieldProps) {
  return (
    <Form.Group>
      <Form.Label className="small fw-semibold mb-1">{label}</Form.Label>
      <div className="d-flex gap-2">
        <Form.Control
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="form-control-color flex-shrink-0"
        />
        <Form.Control
          value={value}
          onChange={(e) => onChange(e.target.value)}
          isInvalid={!!error}
          maxLength={7}
          className="font-monospace"
        />
      </div>
      {error && <div className="invalid-feedback d-block">{error}</div>}
    </Form.Group>
  );
}

export default function SettingsModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  const { settings, save, reset, preview } = useSettings();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Settings>(settings);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (show) {
      setForm(settings);
      setErrors({});
    }
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pré-visualização ao vivo das cores/nome enquanto edita
  useEffect(() => {
    if (show) preview(form);
  }, [form, show, preview]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors(({ [k]: _removed, ...rest }) => rest);
  };

  const close = () => {
    preview(settings); // descarta a pré-visualização
    onHide();
  };

  const pickLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) return toast.error('Logo muito grande (máx. 300 KB)');
    const reader = new FileReader();
    reader.onload = () => set('logo', String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Mesma validação da API, antes de enviar
    const check = settingsSchema.safeParse(form);
    if (!check.success) {
      setErrors(toFieldErrors(check.error));
      toast.error('Verifique os campos destacados');
      return;
    }
    setSaving(true);
    try {
      await save(check.data);
      toast.success('Configurações salvas');
      onHide();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const doReset = async () => {
    setConfirmReset(false);
    try {
      const s = await reset();
      setForm(s);
      toast.success('Configurações restauradas');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  type TextKey = 'nome_sistema' | 'organizacao' | 'telefone' | 'email' | 'endereco';
  const text = (k: TextKey, label: string, props: { maxLength?: number; type?: string } = {}) => (
    <FloatingLabel label={label}>
      <Form.Control
        value={form[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        isInvalid={!!errors[k]}
        placeholder={label}
        {...props}
      />
      <Form.Control.Feedback type="invalid">{errors[k]}</Form.Control.Feedback>
    </FloatingLabel>
  );

  return (
    <>
      <Modal
        show={show && !confirmReset}
        onHide={close}
        size="lg"
        scrollable
        fullscreen="sm-down"
        className="modal-brand"
      >
        <Form onSubmit={submit} noValidate className="d-contents">
          <Modal.Header closeButton closeVariant="white">
            <Modal.Title className="fs-5 fw-bold">
              <i className="bi bi-gear me-2" />
              Configurações do Sistema
            </Modal.Title>
          </Modal.Header>

          <Modal.Body className="p-4">
            {/* ---------- Identidade ---------- */}
            <h6 className="settings-section">Identidade</h6>
            <Row className="g-3">
              <Col md={7}>{text('nome_sistema', 'Nome do sistema', { maxLength: 40 })}</Col>
              <Col md={5}>
                <div
                  className="brand-preview"
                  style={{ background: `linear-gradient(135deg, ${form.cor_primaria}, ${form.cor_secundaria})` }}
                >
                  <BrandMark settings={form} />
                  <span className="text-truncate">{form.nome_sistema || 'Meu Sistema'}</span>
                </div>
              </Col>

              <Col md={7}>
                <Form.Label className="small fw-semibold mb-1">Ícone</Form.Label>
                <div className="icon-grid">
                  {ICONES.map((i) => (
                    <button
                      type="button"
                      key={i}
                      title={i}
                      className={`icon-option ${form.icone === i ? 'active' : ''}`}
                      onClick={() => set('icone', i)}
                    >
                      <i className={`bi bi-${i}`} />
                    </button>
                  ))}
                </div>
                <Form.Control
                  size="sm"
                  className="mt-2 font-monospace"
                  value={form.icone ?? ''}
                  onChange={(e) => set('icone', e.target.value.trim().replace(/^bi-/, ''))}
                  isInvalid={!!errors.icone}
                  placeholder="ou digite o nome de qualquer ícone"
                />
                <Form.Control.Feedback type="invalid">{errors.icone}</Form.Control.Feedback>
                <Form.Text>
                  Catálogo completo em{' '}
                  <a href="https://icons.getbootstrap.com" target="_blank" rel="noreferrer">
                    icons.getbootstrap.com
                  </a>
                </Form.Text>
              </Col>

              <Col md={5}>
                <Form.Label className="small fw-semibold mb-1">Logo (opcional)</Form.Label>
                <div className="logo-drop">
                  {form.logo ? (
                    <img src={form.logo} alt="Logo" />
                  ) : (
                    <span className="text-muted small text-center">
                      PNG, JPG, SVG ou WebP
                      <br />
                      até 300 KB
                    </span>
                  )}
                </div>
                <div className="d-flex gap-2 mt-2">
                  <Button size="sm" variant="outline-primary" onClick={() => fileRef.current?.click()}>
                    <i className="bi bi-upload me-1" />
                    {form.logo ? 'Trocar' : 'Enviar'}
                  </Button>
                  {form.logo && (
                    <Button size="sm" variant="light" className="text-danger" onClick={() => set('logo', '')}>
                      <i className="bi bi-trash me-1" />
                      Remover
                    </Button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  hidden
                  onChange={pickLogo}
                />
                {errors.logo && <div className="invalid-feedback d-block">{errors.logo}</div>}
                <Form.Text>Se enviado, substitui o ícone.</Form.Text>
              </Col>
            </Row>

            {/* ---------- Cores ---------- */}
            <h6 className="settings-section">Cores</h6>
            <div className="d-flex flex-wrap gap-2 mb-3">
              {PALETAS.map(([nome, a, b]) => (
                <button
                  type="button"
                  key={nome}
                  className={`palette-option ${form.cor_primaria === a && form.cor_secundaria === b ? 'active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, cor_primaria: a, cor_secundaria: b }))}
                >
                  <span style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />
                  {nome}
                </button>
              ))}
            </div>
            <Row className="g-3">
              <Col sm={6}>
                <ColorField
                  label="Cor primária (botões, destaques, início do gradiente)"
                  value={form.cor_primaria}
                  onChange={(v) => set('cor_primaria', v)}
                  error={errors.cor_primaria}
                />
              </Col>
              <Col sm={6}>
                <ColorField
                  label="Cor secundária (fim do gradiente do menu)"
                  value={form.cor_secundaria}
                  onChange={(v) => set('cor_secundaria', v)}
                  error={errors.cor_secundaria}
                />
              </Col>
            </Row>

            {/* ---------- Organização ---------- */}
            <h6 className="settings-section">
              Organização{' '}
              <span className="text-muted fw-normal small">— aparece no rodapé e servirá para relatórios</span>
            </h6>
            <Row className="g-3">
              <Col md={6}>{text('organizacao', 'Nome da empresa / responsável')}</Col>
              <Col md={6}>{text('telefone', 'Telefone')}</Col>
              <Col md={6}>{text('email', 'E-mail', { type: 'email' })}</Col>
              <Col md={6}>{text('endereco', 'Endereço')}</Col>
            </Row>

            {/* ---------- Manutenção ---------- */}
            <h6 className="settings-section">Manutenção</h6>
            <Row className="g-3 align-items-center">
              <Col sm={5} md={4}>
                <FloatingLabel label="Manter logs por (dias)">
                  <Form.Control
                    type="number"
                    min={0}
                    max={3650}
                    value={form.dias_logs}
                    onChange={(e) => set('dias_logs', e.target.value === '' ? 0 : Number(e.target.value))}
                    isInvalid={!!errors.dias_logs}
                    placeholder="dias"
                  />
                  <Form.Control.Feedback type="invalid">{errors.dias_logs}</Form.Control.Feedback>
                </FloatingLabel>
              </Col>
              <Col sm={7} md={8} className="small text-muted">
                Logs mais antigos são excluídos automaticamente todos os dias. Use <b>0</b> para nunca excluir.
              </Col>
            </Row>
          </Modal.Body>

          <Modal.Footer className="justify-content-between">
            <Button
              variant="link"
              className="text-muted px-0 text-decoration-none"
              onClick={() => setConfirmReset(true)}
            >
              <i className="bi bi-arrow-counterclockwise me-1" />
              Restaurar padrão
            </Button>
            <div className="d-flex gap-2">
              <Button variant="light" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-check-lg me-1" />}Salvar
              </Button>
            </div>
          </Modal.Footer>
        </Form>
      </Modal>

      <ConfirmModal
        show={confirmReset}
        title="Restaurar configurações"
        message="Nome, cores, logo e demais configurações voltarão ao padrão. Os dados do sistema não são afetados."
        confirmLabel="Restaurar"
        onConfirm={doReset}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
