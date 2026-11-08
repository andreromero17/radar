import { Dropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { isCoreEntity, mainEntities } from '@frame/shared';
import { useAuth } from '../context/AuthContext';

/**
 * Botão "+ Novo": atalho para criar qualquer registro que o usuário tem
 * permissão de criar (cadastros da aplicação primeiro, depois os do núcleo).
 * Com uma opção só, vai direto; sem nenhuma, não aparece.
 */
export default function NewButton({ collapsed }: { collapsed: boolean }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const opcoes = mainEntities()
    .filter(([key]) => can(key, 'criar'))
    .sort(([a], [b]) => Number(isCoreEntity(a)) - Number(isCoreEntity(b)))
    .map(([key, e]) => ({ to: `/${key}/novo`, label: e.singular, icon: e.icon, core: isCoreEntity(key) }));

  if (!opcoes.length) return null;

  const content = (
    <>
      <i className="bi bi-plus-lg" />
      <span className="nav-label">Novo</span>
    </>
  );

  if (opcoes.length === 1) {
    return (
      <Link to={opcoes[0].to} className="btn new-button" title={collapsed ? `Novo ${opcoes[0].label}` : undefined}>
        {content}
      </Link>
    );
  }

  const primeiroNucleo = opcoes.findIndex((o) => o.core);
  return (
    <Dropdown>
      <Dropdown.Toggle className="new-button no-caret" title={collapsed ? 'Novo' : undefined}>
        {content}
      </Dropdown.Toggle>
      <Dropdown.Menu className="shadow" style={{ minWidth: 220 }}>
        <Dropdown.Header>Criar novo</Dropdown.Header>
        {opcoes.map((o, i) => (
          <div key={o.to}>
            {i > 0 && i === primeiroNucleo && <Dropdown.Divider />}
            <Dropdown.Item onClick={() => navigate(o.to)} className="py-2">
              <i className={`bi bi-${o.icon} me-2 text-muted`} />
              {o.label}
            </Dropdown.Item>
          </div>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
