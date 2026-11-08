import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Col, Form, Row as BsRow, Spinner } from 'react-bootstrap';
import {
  getEntity,
  validateEntity,
  type EntityDef,
  type FieldErrors,
  type RelationOption,
  type Row,
} from '@frame/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import FieldInput, { type FormValue, type Option } from '../components/FieldInput';
import NotFound from './NotFound';
import Forbidden from './Forbidden';

type Values = Record<string, FormValue>;

const empty = (type: string): FormValue => (type === 'boolean' ? false : type === 'permissions' ? {} : '');

const defaults = (ent: EntityDef): Values =>
  Object.fromEntries(ent.fields.map((f) => [f.name, f.default ?? empty(f.type)]));

const fromRow = (ent: EntityDef, r: Row): Values =>
  Object.fromEntries(
    ent.fields.map((f) => [f.name, f.type === 'boolean' ? !!r[f.name] : ((r[f.name] as FormValue) ?? empty(f.type))]),
  );

export default function CrudForm() {
  const { entity = '', id } = useParams();
  const isNew = !id;
  const ent = getEntity(entity);
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const allowed = !!ent && can(entity, isNew ? 'criar' : 'ver');
  const readOnly = !isNew && !can(entity, 'editar');

  const [values, setValues] = useState<Values>(() => (ent ? defaults(ent) : {}));
  const [record, setRecord] = useState<Row | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [relOptions, setRelOptions] = useState<Record<string, Option[]>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Carrega o registro (edição) ou reinicia o formulário (novo)
  useEffect(() => {
    if (!ent || !allowed) return;
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
  }, [entity, id, ent, isNew, toast, allowed]);

  // Carrega as opções dos campos de relacionamento (só id + nome)
  useEffect(() => {
    if (!ent || !allowed) return;
    for (const f of ent.fields) {
      if (f.type !== 'relation' || !getEntity(f.entity)) continue;
      api
        .get<RelationOption[]>(`/${f.entity}/opcoes`)
        .then((opts) => setRelOptions((o) => ({ ...o, [f.name]: opts })))
        .catch(() => {});
    }
  }, [ent, allowed]);

  if (!ent) return <NotFound />;
  if (!allowed) return <Forbidden />;

  const onChange = (name: string, v: FormValue) => {
    setValues((s) => ({ ...s, [name]: v }));
    setErrors(({ [name]: _removed, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
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

  const title = `${isNew ? 'Novo' : readOnly ? 'Visualizar' : 'Editar'} ${ent.singular.toLowerCase()}`;
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
                  .filter((f) => !(readOnly && f.type === 'password'))
                  .map((f) => (
                    <Col key={f.name} xs={12} md={f.col || (f.type === 'textarea' ? 12 : 6)}>
                      <FieldInput
                        field={f}
                        value={values[f.name]}
                        onChange={onChange}
                        error={errors[f.name]}
                        options={relOptions[f.name]}
                        isNew={isNew}
                        values={values}
                        disabled={readOnly || !!(f.disabledWhen && values[f.disabledWhen])}
                      />
                    </Col>
                  ))}
              </BsRow>
              <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <Button variant="light" onClick={() => navigate(`/${entity}`)}>
                  {readOnly ? 'Voltar' : 'Cancelar'}
                </Button>
                {!readOnly && (
                  <Button type="submit" disabled={saving}>
                    {saving ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-check-lg me-1" />}
                    Salvar
                  </Button>
                )}
              </div>
            </Form>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
