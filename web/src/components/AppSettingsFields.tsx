import { Col, FloatingLabel, Form, Row } from 'react-bootstrap';
import type { AppSettingDef, AppSettings, FieldErrors } from '@frame/shared';

/** Campos das configurações próprias do sistema (app/settings.ts) na tela de Configurações */
export default function AppSettingsFields({
  defs,
  value,
  errors,
  onChange,
}: {
  defs: AppSettingDef[];
  value: AppSettings;
  errors: FieldErrors;
  onChange: (chave: string, v: string | number | boolean) => void;
}) {
  return (
    <Row className="g-3">
      {defs.map((d) => {
        const id = `app-${d.chave}`;
        const v = value[d.chave] ?? d.default;
        const ajuda = d.help && <Form.Text>{d.help}</Form.Text>;
        if (d.type === 'boolean')
          return (
            <Col xs={12} key={d.chave}>
              <Form.Check
                type="switch"
                id={id}
                label={d.label}
                checked={!!v}
                onChange={(e) => onChange(d.chave, e.target.checked)}
              />
              {ajuda}
            </Col>
          );
        return (
          <Col xs={12} md={d.type === 'text' ? 12 : 8} key={d.chave}>
            <FloatingLabel controlId={id} label={d.label}>
              {d.type === 'select' ? (
                <Form.Select
                  value={String(v)}
                  onChange={(e) => onChange(d.chave, e.target.value)}
                  isInvalid={!!errors[d.chave]}
                >
                  {(d.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Form.Select>
              ) : (
                <Form.Control
                  type={d.type === 'number' ? 'number' : 'text'}
                  min={d.min}
                  max={d.max}
                  value={String(v)}
                  placeholder={d.label}
                  onChange={(e) => onChange(d.chave, d.type === 'number' ? Number(e.target.value) : e.target.value)}
                  isInvalid={!!errors[d.chave]}
                />
              )}
              <Form.Control.Feedback type="invalid">{errors[d.chave]}</Form.Control.Feedback>
            </FloatingLabel>
            {ajuda}
          </Col>
        );
      })}
    </Row>
  );
}
