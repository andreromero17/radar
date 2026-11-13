import { useState } from 'react';
import { ButtonGroup, Dropdown, ToggleButton } from 'react-bootstrap';
import {
  APARENCIAS,
  PAPEL_LABELS,
  TAMANHOS_TEXTO,
  appSettings,
  type Aparencia,
  type AuthUser,
  type TamanhoTexto,
} from '@frame/shared';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import SettingsModal from '../components/SettingsModal';
import Sino from '../components/Sino';
import EspacoModal from '../components/EspacoModal';
import FeedbackModal from '../components/FeedbackModal';
import { ICONE_TIPO, recarregarNoEspaco, trocarEspaco } from '../lib/espacos';

import { useAuth } from '../context/AuthContext';
import { initials } from '../lib/format';

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, can, logout, setUser } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [novoEspaco, setNovoEspaco] = useState(false);
  const [feedback, setFeedback] = useState(false);
  // assinante (dono de algum espaço) ou administrador cria espaços
  const podeCriarEspaco = !!user?.admin || !!user?.espacos?.some((e) => e.papel === 'dono');
  const mudarAparencia = async (aparencia: Aparencia) => {
    if (!user || aparencia === user.aparencia) return;
    setUser({ ...user, aparencia }); // aplica na hora; grava em seguida
    await api.put<AuthUser>('/auth/perfil', { aparencia }).catch(() => {});
  };
  const mudarTamanho = async (tamanho_texto: TamanhoTexto) => {
    if (!user || tamanho_texto === user.tamanho_texto) return;
    setUser({ ...user, tamanho_texto });
    await api.put<AuthUser>('/auth/perfil', { tamanho_texto }).catch(() => {});
  };

  return (
    <header className="app-topbar">
      <button className="btn btn-light d-lg-none" onClick={onMenu} aria-label="Abrir menu">
        <i className="bi bi-list fs-5" />
      </button>

      {/* título e ações da página (tema Minimalista, desktop) — preenchidos pelo PageHeader */}
      <div className="topbar-title" id="topbar-title" />
      <div className="topbar-actions" id="topbar-actions" />
      {/* espaço para filtros globais da aplicação (ex.: seletor de período) */}
      <div className="topbar-center" id="topbar-slot" />

      <Sino />
      <Dropdown align="end">
        <Dropdown.Toggle variant="light" className="d-flex align-items-center gap-2" aria-label="Menu do usuário">
          <span className="avatar">{initials(user?.nome)}</span>
          <span className="d-none d-md-flex flex-column align-items-start lh-sm">
            <span className="fw-bold">{user?.nome}</span>
            {user?.espacos && user.espacos.length > 1 && <span className="small text-muted">{user.espaco?.nome}</span>}
          </span>
        </Dropdown.Toggle>
        <Dropdown.Menu className="shadow-sm" style={{ minWidth: 240 }}>
          <div className="px-3 py-2 border-bottom mb-1">
            <div className="fw-bold text-truncate">{user?.nome}</div>
            <div className="small text-muted text-truncate">{user?.email}</div>
            <span className="badge rounded-pill bg-body-secondary text-body border mt-1">
              <i className="bi bi-shield-lock me-1" />
              {user?.perfil}
            </span>
          </div>
          {user?.espacos && user.espacos.length > 0 && (
            <>
              <Dropdown.Header className="pb-1">Espaços</Dropdown.Header>
              {user.espacos.map((e) => {
                const atual = e.id === user.espaco?.id;
                return (
                  <Dropdown.Item
                    key={e.id}
                    className="d-flex align-items-center gap-2"
                    onClick={() => !atual && void trocarEspaco(e.id)}
                    aria-current={atual}
                  >
                    <i
                      className={`bi bi-${atual ? 'check-circle-fill text-primary' : (ICONE_TIPO[e.tipo] ?? 'house-door')}`}
                    />
                    <span className={`text-truncate flex-grow-1 ${atual ? 'fw-semibold' : ''}`}>{e.nome}</span>
                    <span className="small text-muted">{PAPEL_LABELS[e.papel]}</span>
                  </Dropdown.Item>
                );
              })}
              {can('membros', 'ver') && (
                <Dropdown.Item as={Link} to="/membros">
                  <i className="bi bi-people me-2" />
                  Membros do espaço
                </Dropdown.Item>
              )}
              {podeCriarEspaco && (
                <Dropdown.Item onClick={() => setNovoEspaco(true)}>
                  <i className="bi bi-plus-circle me-2" />
                  Novo espaço
                </Dropdown.Item>
              )}
              <Dropdown.Divider />
            </>
          )}
          <div className="px-3 pt-1 pb-2">
            <div className="small text-muted mb-1">Aparência</div>
            <ButtonGroup size="sm" className="w-100 aparencia-group">
              {APARENCIAS.map((a) => (
                <ToggleButton
                  key={a}
                  id={`aparencia-${a}`}
                  type="radio"
                  variant="light"
                  className="border"
                  value={a}
                  checked={user?.aparencia === a}
                  onChange={() => void mudarAparencia(a)}
                  title={a === 'sistema' ? 'Segue o aparelho' : undefined}
                >
                  <i
                    className={`bi bi-${a === 'claro' ? 'sun' : a === 'escuro' ? 'moon-stars' : 'circle-half'} me-1`}
                  />
                  {a === 'sistema' ? 'Auto' : a === 'claro' ? 'Claro' : 'Escuro'}
                </ToggleButton>
              ))}
            </ButtonGroup>
            <div className="small text-muted mb-1 mt-2">Tamanho do texto</div>
            <ButtonGroup size="sm" className="w-100 aparencia-group">
              {TAMANHOS_TEXTO.map((t) => (
                <ToggleButton
                  key={t}
                  id={`tamanho-${t}`}
                  type="radio"
                  variant="light"
                  className="border"
                  value={t}
                  checked={(user?.tamanho_texto ?? 'normal') === t}
                  onChange={() => void mudarTamanho(t)}
                  aria-label={`Texto ${t}`}
                  title={t === 'pequeno' ? 'Pequeno' : t === 'grande' ? 'Grande' : 'Normal'}
                >
                  <span className={`tamanho-amostra ${t}`}>A</span>
                </ToggleButton>
              ))}
            </ButtonGroup>
          </div>
          <Dropdown.Divider />
          <Dropdown.Item as={Link} to="/perfil">
            <i className="bi bi-person me-2" />
            Meu perfil
          </Dropdown.Item>
          <Dropdown.Item as={Link} to="/trocar-senha">
            <i className="bi bi-key me-2" />
            Alterar senha
          </Dropdown.Item>
          {(user?.admin || (can('configuracoes', 'editar') && appSettings.length > 0)) && (
            <Dropdown.Item onClick={() => setShowSettings(true)}>
              <i className="bi bi-gear me-2" />
              Configurações
            </Dropdown.Item>
          )}
          <Dropdown.Item onClick={() => setFeedback(true)}>
            <i className="bi bi-chat-heart me-2" />
            Enviar feedback
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item onClick={() => void logout()}>
            <i className="bi bi-box-arrow-left me-2" />
            Sair
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <SettingsModal show={showSettings} onHide={() => setShowSettings(false)} />
      <FeedbackModal show={feedback} onHide={() => setFeedback(false)} />
      <EspacoModal show={novoEspaco} onHide={() => setNovoEspaco(false)} onSalvo={recarregarNoEspaco} />
    </header>
  );
}
