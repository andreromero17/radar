import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { api } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useMeta } from '../context/MetaContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import FieldInput from '../components/FieldInput';
import NotFound from './NotFound';

const defaults = (ent) =>
  Object.fromEntries(ent.fields.map((f) => [f.name, f.default ?? (f.type === 'boolean' ? false : '')]));

export default function CrudForm() {
  const { entity, id } = useParams();
  const isNew = !id;
  const { entities } = useMeta();
  const ent = entities[entity];
  const navigate = useNavigate();
  const toast = useToast();

  const [values, setValues] = useState(() => (ent ? defaults(ent) : {}));
  const [record, setRecord] = useState(null);
  const [errors, setErrors] = useState({});
  const [relOptions, setRelOptions] = useState({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Carrega o registro (edição)
  useEffect(() => {
    if (!ent) return;
    setErrors({});
    if (isNew) {
      setValues(defaults(ent));
      setRecord(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get(`/${entity}/${id}`)
      .then((r) => {
        setRecord(r);
        setValues(Object.fromEntries(ent.fields.map((f) => [f.name, f.type === 'boolean' ? !!r[f.name] : r[f.name] ?? ''])));
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [entity, id, ent, isNew, toast]);

  // Carrega opções dos campos de relacionamento
  useEffect(() => {
    if (!ent) return;
    ent.fields
      .filter((f) => f.type === 'relation')
      .forEach((f) => {
        const rel = entities[f.entity];
        api.get(`/${f.entity}?pageSize=1000&sort=${rel.labelField}&dir=asc`).then(({ rows }) =>
          setRelOptions((o) => ({ ...o, [f.name]: rows.map((r) => ({ value: r.id, label: r[rel.labelField] })) })),
        );
      });
  }, [ent, entities]);

  if (!ent) return <NotFound />;

  const onChange = (name, v) => {
    setValues((s) => ({ ...s, [name]: v }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) await api.post(`/${entity}`, values);
      else await api.put(`/${entity}/${id}`, values);
      toast.success(`${ent.singular} ${isNew ? 'criado' : 'atualizado'} com sucesso`);
      navigate(`/${entity}`);
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const title = isNew ? `Novo ${ent.singular.toLowerCase()}` : `Editar ${ent.singular.toLowerCase()}`;

  return (
    <>
      <PageHeader
        title={title}
        icon={ent.icon}
        back={`/${entity}`}
        subtitle={record ? `Criado em ${fmtDate(record.criado_em, true)}${record.atualizado_em ? ` · atualizado em ${fmtDate(record.atualizado_em, true)}` : ''}` : undefined}
      />

      <Card className="card-app">
        <Card.Body className="p-4">
          {loading ? (
            <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
          ) : (
            <Form noValidate onSubmit={submit}>
              <Row className="g-3">
                {ent.fields
                  .filter((f) => !(isNew && f.readonly))
                  .map((f) => (
                    <Col key={f.name} xs={12} md={f.col || (f.type === 'textarea' ? 12 : 6)}>
                      <FieldInput field={f} value={values[f.name]} onChange={onChange} error={errors[f.name]} options={relOptions[f.name]} />
                    </Col>
                  ))}
              </Row>
              <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <Button variant="light" onClick={() => navigate(`/${entity}`)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-check-lg me-1" />}
                  Salvar
                </Button>
              </div>
            </Form>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
