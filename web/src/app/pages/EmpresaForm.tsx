import { useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useParams } from 'react-router-dom';
import CrudForm from '../../pages/CrudForm';
import { reduzirImagem } from '../../lib/imagem';
import LogoEmpresa from '../components/LogoEmpresa';
import { TagsEditaveis } from '../components/SeletorTags';

/**
 * Formulário genérico de empresas com o logo em destaque: grande, mostrando o que está em uso — o enviado ou, sem
 * ele, o baixado do LinkedIn. Enviar substitui; remover o enviado volta a valer o do LinkedIn.
 */
function CampoLogo({
  value,
  nome,
  doLinkedin,
  onChange,
  disabled,
}: {
  value: string;
  nome: string;
  doLinkedin: string | null;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState('');
  const emUso = value || doLinkedin;
  return (
    <div className="d-flex flex-wrap align-items-center gap-3">
      <LogoEmpresa nome={nome || '?'} logo={emUso} tamanho={6} />
      <div className="d-flex flex-column gap-2">
        <div className="small text-muted">
          {value
            ? 'Logo enviado (tem prioridade sobre o do LinkedIn).'
            : doLinkedin
              ? 'Logo obtido da página do LinkedIn.'
              : 'Sem logo: vem do LinkedIn na próxima busca de "Logos e seguidores", ou envie um.'}
        </div>
        <div className="d-flex flex-wrap gap-2">
          <input
            ref={ref}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="d-none"
            disabled={disabled}
            aria-label="Enviar logo"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setErro('');
              try {
                onChange(await reduzirImagem(f));
              } catch (err) {
                setErro((err as Error).message);
              }
            }}
          />
          <Button size="sm" variant="light" className="border" disabled={disabled} onClick={() => ref.current?.click()}>
            <i className="bi bi-upload me-1" />
            {emUso ? 'Substituir logo' : 'Enviar logo'}
          </Button>
          {value && !disabled && (
            <Button size="sm" variant="light" className="text-danger" onClick={() => onChange('')}>
              {doLinkedin ? 'Voltar ao do LinkedIn' : 'Remover'}
            </Button>
          )}
        </div>
        {erro && <span className="small text-danger">{erro}</span>}
      </div>
    </div>
  );
}

export default function EmpresaForm() {
  const { id } = useParams();
  return (
    <CrudForm
      entity="empresas"
      after={
        id ? (
          <div className="mt-3">
            <div className="form-label">Tags</div>
            <TagsEditaveis empresaId={Number(id)} ids={[]} carregar />
          </div>
        ) : null
      }
      campos={{
        logo: ({ value, values, set, disabled }) => (
          <CampoLogo
            value={String(value || '')}
            nome={String(values.nome_curto || values.nome || '')}
            doLinkedin={(values.logo_linkedin as string | null) || null}
            onChange={(v) => set('logo', v)}
            disabled={disabled}
          />
        ),
      }}
    />
  );
}
