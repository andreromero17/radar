import CrudForm from '../../pages/CrudForm';
import FieldInput from '../../components/FieldInput';
import LogoEmpresa from '../components/LogoEmpresa';

/**
 * Formulário genérico de empresas, com o campo Logo mostrando o logo baixado do LinkedIn quando não há um enviado.
 * O enviado tem prioridade; apagar o enviado volta a valer o do LinkedIn.
 */
export default function EmpresaForm() {
  return (
    <CrudForm
      entity="empresas"
      campos={{
        logo: ({ field, value, values, set, error, disabled }) => {
          const doLinkedin = (values.logo_linkedin as string | null) || null;
          return (
            <>
              <FieldInput
                field={{ ...field, help: undefined }}
                value={value}
                onChange={(v) => set('logo', v)}
                error={error}
                disabled={disabled}
                values={values}
              />
              <div className="d-flex align-items-center gap-2 mt-2 small text-muted">
                {value ? (
                  <span>Logo enviado (tem prioridade sobre o do LinkedIn).</span>
                ) : doLinkedin ? (
                  <>
                    <LogoEmpresa nome={String(values.nome || '')} logo={doLinkedin} tamanho={2.25} />
                    <span>Em uso: logo obtido da página do LinkedIn. Envie uma imagem acima para substituir.</span>
                  </>
                ) : (
                  <span>
                    Sem logo ainda: vem da página do LinkedIn na próxima busca de "Logos e seguidores", ou envie acima.
                  </span>
                )}
              </div>
            </>
          );
        },
      }}
    />
  );
}
