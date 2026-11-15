import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, Col, Form, Row as BsRow, Spinner } from 'react-bootstrap';
import {
  novoRotulo,
  computeFields,
  detailEntity,
  detailSums,
  getEntity,
  summedFields,
  validateDetails,
  validateEntity,
  type EntityDef,
  type FieldDef,
  type FieldErrors,
  type RelationOption,
  type Row,
} from '@frame/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { fmtDate } from '../lib/format';
import { urlLista } from '../lib/listParams';
import { useVolta } from '../lib/voltar';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import FieldInput, { type FormValue, type Option } from '../components/FieldInput';
import DetailTable from '../components/DetailTable';
import AnexosCard from '../components/AnexosCard';
import { fromApiRows, newDetailRow, toApiRows, type DetailRow } from '../lib/details';
import { defaults, empty, type Values } from '../lib/formValues';
import NotFound from './NotFound';
import Forbidden from './Forbidden';

type Details = Record<string, DetailRow[]>;

/** Sub-tabelas de um registro novo: já com as linhas mínimas */
const emptyDetails = (ent: EntityDef): Details =>
  Object.fromEntries(
    (ent.details ?? []).map((d) => {
      const fields = detailEntity(d)?.fields ?? [];
      return [d.entity, Array.from({ length: d.min ?? 0 }, () => newDetailRow(fields))];
    }),
  );

/** O que um campo próprio recebe (CrudForm `campos`) */
export interface CampoProprioCtx {
  field: FieldDef;
  value: FormValue;
  values: Values;
  /** Muda um campo qualquer do formulário (um campo próprio pode preencher vários) */
  set: (name: string, v: FormValue) => void;
  error?: string;
  /** Opções já carregadas dos campos de relacionamento, por nome do campo */
  options: Record<string, Option[]>;
  disabled: boolean;
  isNew: boolean;
}

interface Props {
  /** Entidade (padrão: a da URL) — para telas próprias que reaproveitam o formulário genérico */
  entity?: string;
  /** Conteúdo extra abaixo do formulário */
  after?: ReactNode;
  /** Campos desenhados pelo sistema, por nome: substituem o campo genérico no mesmo lugar e largura */
  campos?: Record<string, (ctx: CampoProprioCtx) => ReactNode>;
  /** Campos escondidos conforme o que está preenchido (continuam no formulário e são enviados) */
  ocultar?: (values: Values) => string[];
}

const fromRow = (ent: EntityDef, r: Row): Values =>
  Object.fromEntries(
    ent.fields.map((f) => [f.name, f.type === 'boolean' ? !!r[f.name] : ((r[f.name] as FormValue) ?? empty(f.type))]),
  );

/** Agrupa os campos por `section`, na ordem em que as seções aparecem */
function sections(fields: FieldDef[]): [string | undefined, FieldDef[]][] {
  const out: [string | undefined, FieldDef[]][] = [];
  for (const f of fields) {
    const existing = out.find(([s]) => s === f.section);
    if (existing) existing[1].push(f);
    else out.push([f.section, [f]]);
  }
  return out;
}

export default function CrudForm(props: Props) {
  const params = useParams();
  const entity = props.entity ?? params.entity ?? '';
  const { id } = params;
  const [search] = useSearchParams();
  const preset = search.toString();
  const isNew = !id;
  const ent = getEntity(entity);
  const navigate = useNavigate();
  const volta = useVolta(urlLista(entity));
  const toast = useToast();
  const { can } = useAuth();
  const allowed = !!ent && can(entity, isNew ? 'criar' : 'ver');
  const readOnly = !isNew && !can(entity, 'editar');

  const [values, setValues] = useState<Values>(() => (ent ? defaults(ent, search) : {}));
  const [details, setDetails] = useState<Details>(() => (ent ? emptyDetails(ent) : {}));
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
      setValues(defaults(ent, new URLSearchParams(preset)));
      setDetails(emptyDetails(ent));
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
        setDetails(Object.fromEntries((ent.details ?? []).map((d) => [d.entity, fromApiRows(r[d.entity])])));
      })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [entity, id, ent, isNew, toast, allowed, preset]);

  // Carrega as opções dos campos de relacionamento (só id + nome)
  useEffect(() => {
    if (!ent || !allowed) return;
    for (const f of ent.fields) {
      if (f.type !== 'relation' || f.dependsOn || !getEntity(f.entity)) continue;
      api
        .get<RelationOption[]>(`/${f.entity}/opcoes`)
        .then((opts) => setRelOptions((o) => ({ ...o, [f.name]: opts })))
        .catch(() => {});
    }
    // relações dentro das sub-tabelas: chave "entidade.campo"
    for (const d of ent.details ?? []) {
      for (const f of detailEntity(d)?.fields ?? []) {
        if (f.type !== 'relation' || !getEntity(f.entity)) continue;
        api
          .get<RelationOption[]>(`/${f.entity}/opcoes`)
          .then((opts) => setRelOptions((o) => ({ ...o, [`${d.entity}.${f.name}`]: opts })))
          .catch(() => {});
      }
    }
  }, [ent, allowed]);

  // Selects dependentes (ex.: categoria conforme o tipo): recarrega quando o campo "pai" muda
  const dependents = ent?.fields.filter((f) => f.type === 'relation' && f.dependsOn && getEntity(f.entity)) ?? [];
  const parentKey = dependents.map((f) => `${f.name}=${String(values[f.dependsOn!.field] ?? '')}`).join('&');
  useEffect(() => {
    if (!allowed || loading) return;
    for (const f of dependents) {
      const dep = f.dependsOn!;
      const pai = values[dep.field];
      const qs = new URLSearchParams();
      if (pai !== '' && pai != null) qs.set(dep.param ?? dep.field, String(pai));
      const atual = values[f.name];
      if (atual !== '' && atual != null) qs.set('incluir', String(atual));
      api
        .get<RelationOption[]>(`/${f.entity}/opcoes?${qs}`)
        .then((opts) => {
          setRelOptions((o) => ({ ...o, [f.name]: opts }));
          // a opção escolhida não combina mais com o pai: limpa
          setValues((v) => {
            const cur = v[f.name];
            if (cur === '' || cur == null || pai === '' || pai == null) return v;
            return opts.some((op) => String(op.value) === String(cur)) ? v : { ...v, [f.name]: '' };
          });
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentKey, allowed, loading]);

  if (!ent) return <NotFound />;
  if (!allowed) return <Forbidden />;

  const onChange = (name: string, v: FormValue) => {
    setValues((s) => ({ ...s, [name]: v }));
    setErrors(({ [name]: _removed, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    // Mesma validação que a API usa (gerada das entidades), incluindo as sub-tabelas
    const linhas = Object.fromEntries(Object.entries(details).map(([k, rows]) => [k, toApiRows(rows)]));
    const check = validateEntity(ent, values, isNew ? 'create' : 'update');
    const checkDet = validateDetails(ent, linhas);
    if (!check.ok || !checkDet.ok) {
      setErrors({ ...(!check.ok && check.errors), ...(!checkDet.ok && checkDet.errors) });
      toast.error('Verifique os campos destacados');
      return;
    }
    setSaving(true);
    try {
      const body = { ...check.data, ...linhas };
      if (isNew) await api.post(`/${entity}`, body);
      else await api.put(`/${entity}/${id}`, body);
      toast.success(`${ent.singular} ${isNew ? 'criado' : 'atualizado'} com sucesso`);
      navigate(volta.to, { state: volta.state });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const title = isNew ? novoRotulo(ent) : `${readOnly ? 'Visualizar' : 'Editar'} ${ent.singular.toLowerCase()}`;
  const subtitle = record
    ? `Criado em ${fmtDate(record.criado_em, true)}${record.atualizado_em ? ` · atualizado em ${fmtDate(record.atualizado_em, true)}` : ''}`
    : undefined;

  // o que a tela mostra: valores digitados + calculados + somas das sub-tabelas (a API recalcula ao gravar)
  const somas = summedFields(ent);
  const shown: Values = {
    ...values,
    ...computeFields(ent, values),
    ...detailSums(ent, details as Record<string, Record<string, unknown>[]>),
  };
  const naLixeira = !!record?.excluido_em;
  const ocultos = new Set(props.ocultar?.(values) ?? []);

  return (
    <>
      <PageHeader title={title} icon={ent.icon} back={volta} subtitle={subtitle} />

      <Card className="card-app">
        <Card.Body className="p-4">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <Form noValidate onSubmit={submit}>
              {sections(
                ent.fields
                  .filter((f) => !f.hidden && !(isNew && f.readonly) && !(!isNew && f.createOnly))
                  .filter((f) => !ocultos.has(f.name))
                  .filter((f) => !(readOnly && f.type === 'password')),
              ).map(([section, fields], i) => (
                <fieldset key={section ?? i} className={section ? 'form-section' : undefined}>
                  {section && <legend className="form-section-title">{section}</legend>}
                  <BsRow className="g-3">
                    {fields.map((f) => (
                      <Col key={f.name} xs={12} md={f.col || (f.type === 'textarea' ? 12 : 6)}>
                        {props.campos?.[f.name] ? (
                          props.campos[f.name]({
                            field: f,
                            value: shown[f.name],
                            values,
                            set: onChange,
                            error: errors[f.name],
                            options: relOptions,
                            disabled: readOnly,
                            isNew,
                          })
                        ) : (
                          <FieldInput
                            field={f}
                            value={shown[f.name]}
                            onChange={onChange}
                            error={errors[f.name]}
                            options={relOptions[f.name]}
                            isNew={isNew}
                            values={values}
                            disabled={readOnly || somas.has(f.name) || !!(f.disabledWhen && values[f.disabledWhen])}
                          />
                        )}
                      </Col>
                    ))}
                  </BsRow>
                </fieldset>
              ))}
              {(ent.details ?? []).map((d) => (
                <DetailTable
                  key={d.entity}
                  detail={d}
                  rows={details[d.entity] ?? []}
                  onChange={(rows) => {
                    setDetails((s) => ({ ...s, [d.entity]: rows }));
                    // linhas mudaram de posição: erros antigos da sub-tabela não valem mais
                    setErrors((er) =>
                      Object.fromEntries(Object.entries(er).filter(([k]) => !k.startsWith(`${d.entity}`))),
                    );
                  }}
                  errors={errors}
                  options={relOptions}
                  readOnly={readOnly}
                />
              ))}
              <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <Button variant="light" onClick={() => navigate(volta.to, { state: volta.state })}>
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

      {ent.anexos && !isNew && record && (
        <AnexosCard entity={entity} id={record.id} canEdit={can(entity, 'editar') && !naLixeira} />
      )}
      {props.after}
    </>
  );
}
