import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Col, Form, Row as BsRow, Spinner } from 'react-bootstrap';
import { getEntity, validateEntity, type EntityDef, type FieldErrors, type ListResponse, type Row } from '@frame/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import FieldInput, { type FormValue, type Option } from '../components/FieldInput';
import NotFound from './NotFound';

type Values = Record<string, FormValue>;

const defaults = (ent: EntityDef): Values =>
  Object.fromEntries(ent.fields.map((f) => [f.name, f.default ?? (f.type === 'boolean' ? false : '')]));

const fromRow = (ent: EntityDef, r: Row): Values =>
  Object.fromEntries(
    ent.fields.map((f) => [f.name, f.type === 'boolean' ? !!r[f.name] : ((r[f.name] as FormValue) ?? '')]),
  );

export default function CrudForm() {
  const { entity = '', id } = useParams();
  const isNew = !id;
  const ent = getEntity(entity);
  const navigate = useNavigate();
  const toast = useToast();

  const [values, setValues] = useState<Values>(() => (ent ? defaults(ent) : {}));
  const [record, setRecord] = useState<Row | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [relOptions, setRelOptions] = useState<Record<string, Option[]>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Carrega o registro (edição) ou reinicia o formulário (novo)
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
      .get<Row>(`/${entity}/${id}`)
      .then((r) => {
        setRecord(r);
        setValues(fromRow(ent, r));
      })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [entity, id, ent, isNew, toast]);

  // Carrega as opções dos campos de relacionamento
  useEffect(() => {
    if (!ent) return;
    for (const f of ent.fields) {
      const rel = f.type === 'relation' ? getEntity(f.entity) : undefined;
      if (!rel) continue;
      api
        .get<ListResponse>(`/${f.entity}?pageSize=1000&sort=${rel.labelField}&dir=asc`)
        .then(({ rows }) =>
          setRelOptions((o) => ({
            ...o,
            [f.name]: rows.map((r) => ({ value: r.id, label: String(r[rel.labelField] ?? r.id) })),
          })),
        )
        .catch(() => {});
    }
  }, [ent]);

  if (!ent) return <NotFound />;

  const onChange = (name: string, v: FormValue) => {
    setValues((s) => ({ ...s, [name]: v }));
    setErrors(({ [name]: _removed, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Mesma validação que a API usa (gerada das entidades)
    const check = validateEntity(ent, values, isNew ? 'create' : 'update');
    if (!check.ok) {
      setErrors(check.errors);
      toast.error('Verifique os campos destacados');
      return;
    }
    setSaving(true);
    try {
      if (isNew) await api.post(`/${entity}`, check.data);
      else await api.put(`/${entity}/${id}`, check.data);
      toast.success(`${ent.singular} ${isNew ? 'criado' : 'atualizado'} com sucesso`);
      navigate(`/${entity}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const title = `${isNew ? 'Novo' : 'Editar'} ${ent.singular.toLowerCase()}`;
  const subtitle = record
    ? `Criado em ${fmtDate(record.criado_em, true)}${record.atualizado_em ? ` · atualizado em ${fmtDate(record.atualizado_em, true)}` : ''}`
    : undefined;

  return (
    <>
      <PageHeader title={title} icon={ent.icon} back={`/${entity}`} subtitle={subtitle} />

      <Card className="card-app">
        <Card.Body className="p-4">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <Form noValidate onSubmit={submit}>
              <BsRow className="g-3">
                {ent.fields
                  .filter((f) => !(isNew && f.readonly))
                  .map((f) => (
                    <Col key={f.name} xs={12} md={f.col || (f.type === 'textarea' ? 12 : 6)}>
                      <FieldInput
                        field={f}
                        value={values[f.name]}
                        onChange={onChange}
                        error={errors[f.name]}
                        options={relOptions[f.name]}
                      />
                    </Col>
                  ))}
              </BsRow>
              <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <Button variant="light" onClick={() => navigate(`/${entity}`)}>
                  Cancelar
                </Button>
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
