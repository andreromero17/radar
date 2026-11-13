import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TERMOS_VERSAO } from '@frame/shared';
import { useSettings } from '../../context/SettingsContext';
import BrandMark from '../../components/BrandMark';

/**
 * Termos de uso e política de privacidade (Fase 5D). Texto-base para a fase de testes, com o nome do sistema, a
 * organização e o e-mail das Configurações. Revise com um advogado antes de abrir comercialmente; ao mudar algo
 * relevante, suba TERMOS_VERSAO (shared/src/legal.ts).
 */
function Pagina({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { settings } = useSettings();
  const data = TERMOS_VERSAO.split('-').reverse().join('/');
  return (
    <div className="legal-page">
      <div className="legal-card">
        <Link to="/" className="auth-brand text-decoration-none mb-3">
          <BrandMark settings={settings} />
          <span>{settings.nome_sistema}</span>
        </Link>
        <h1 className="h3 fw-bold">{titulo}</h1>
        <p className="text-muted small">Versão de {data}</p>
        {children}
        <hr />
        <p className="small text-muted mb-0">
          <Link to="/termos">Termos de uso</Link> · <Link to="/privacidade">Política de privacidade</Link> ·{' '}
          <a href="#" onClick={(e) => (e.preventDefault(), window.history.back())}>
            Voltar
          </a>
        </p>
      </div>
    </div>
  );
}

const useDados = () => {
  const { settings } = useSettings();
  return {
    sistema: settings.nome_sistema,
    quem: settings.organizacao || `os responsáveis pelo ${settings.nome_sistema}`,
    contato: settings.email,
  };
};

export function Termos() {
  const { sistema, quem, contato } = useDados();
  return (
    <Pagina titulo="Termos de uso">
      <h2>1. O que é</h2>
      <p>
        O {sistema} é um sistema on-line mantido por {quem}. Ao criar uma conta ou aceitar um convite, você concorda com
        estes termos e com a <Link to="/privacidade">política de privacidade</Link>.
      </p>
      <h2>2. Fase de testes</h2>
      <p>
        O sistema está em <b>fase de testes</b>, aberto a um grupo pequeno de pessoas convidadas. Ele pode mudar, ter
        falhas ou ficar fora do ar. Não há cobrança nesta fase. Mantenha uma cópia das informações que forem importantes
        para você: em Meu perfil, você pode baixar os seus dados a qualquer momento. Suas sugestões e relatos de
        problemas (menu do usuário → Enviar feedback) são muito bem-vindos.
      </p>
      <h2>3. Sua conta</h2>
      <ul>
        <li>Use dados verdadeiros e mantenha sua senha em segredo; recomendamos ligar a verificação em duas etapas.</li>
        <li>Você responde pelo que é feito com a sua conta e pelas pessoas que convidar para os seus espaços.</li>
        <li>Não use o sistema para fins ilegais nem tente acessar dados de outras pessoas.</li>
      </ul>
      <h2>4. Seus dados são seus</h2>
      <p>
        As informações e os arquivos que você registra pertencem a você (ou ao dono do espaço em que foram registrados).
        Nós não os vendemos nem os usamos para outro fim que não seja fazer o sistema funcionar. Você pode baixá-los e
        excluir a sua conta quando quiser.
      </p>
      <h2>5. Espaços e convidados</h2>
      <p>
        Cada espaço tem um dono, que decide quem participa e com qual papel (editor ou leitor). Quem é convidado vê o
        espaço inteiro. O dono pode inativar ou remover membros a qualquer momento.
      </p>
      <h2>6. Suporte</h2>
      <p>
        A equipe da plataforma não acessa os dados de um espaço sem a liberação do dono, por prazo definido por ele.
        Todo acesso de suporte fica registrado e visível ao dono.
      </p>
      <h2>7. Limitação</h2>
      <p>
        O {sistema} é uma ferramenta de organização: as decisões tomadas a partir das informações dele são suas. Na fase
        de testes, o sistema é oferecido como está, sem garantia de disponibilidade.
      </p>
      <h2>8. Mudanças e encerramento</h2>
      <p>
        Estes termos podem mudar; avisaremos as mudanças relevantes. Você pode encerrar a conta a qualquer momento. Se a
        fase de testes terminar, avisaremos com antecedência para que você baixe os seus dados.
      </p>
      {contato && (
        <>
          <h2>9. Contato</h2>
          <p>
            <a href={`mailto:${contato}`}>{contato}</a>
          </p>
        </>
      )}
    </Pagina>
  );
}

export function Privacidade() {
  const { sistema, quem, contato } = useDados();
  return (
    <Pagina titulo="Política de privacidade">
      <p>
        Esta política explica como o {sistema}, mantido por {quem}, trata os seus dados pessoais, conforme a Lei Geral
        de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>
      <h2>1. Dados que tratamos</h2>
      <ul>
        <li>
          <b>Conta:</b> nome, e-mail, senha (guardada só como código irreversível) e preferências (aparência, tamanho do
          texto).
        </li>
        <li>
          <b>O que você registra:</b> os cadastros, lançamentos e arquivos anexados dos seus espaços.
        </li>
        <li>
          <b>Uso e segurança:</b> registros de acesso (data, endereço IP e navegador), sessões abertas e o histórico de
          alterações de cada espaço.
        </li>
        <li>
          <b>Feedback:</b> o que você nos enviar pelo sistema.
        </li>
      </ul>
      <h2>2. Para quê</h2>
      <p>
        Para prestar o serviço (guardar e calcular as suas informações), manter a sua conta segura, cumprir obrigações
        legais e melhorar o sistema a partir do feedback. A base legal é a execução do serviço que você contratou, o
        legítimo interesse em segurança e o cumprimento de obrigação legal (registros de acesso, Marco Civil da
        Internet).
      </p>
      <h2>3. Com quem compartilhamos</h2>
      <p>
        Não vendemos nem compartilhamos os seus dados para publicidade. Eles ficam em servidores contratados para
        hospedar o sistema e o envio de e-mails, que só os processam para isso. Esses servidores podem ficar fora do
        Brasil (por exemplo, nos Estados Unidos); nesse caso a transferência segue a LGPD, com fornecedores que adotam
        salvaguardas de segurança adequadas. Dentro de um espaço, os membros que o dono convidou veem os dados daquele
        espaço.
      </p>
      <h2>4. Segurança</h2>
      <ul>
        <li>Cada espaço tem o próprio banco de dados, separado dos demais.</li>
        <li>Senhas protegidas por criptografia; verificação em duas etapas disponível.</li>
        <li>Suporte só com a liberação do dono e com registro de cada acesso.</li>
      </ul>
      <h2>5. Por quanto tempo</h2>
      <p>
        Enquanto a sua conta existir. Ao excluí-la, os espaços de que você é o único dono são apagados de vez em até 30
        dias (o prazo existe para corrigir um engano); nos espaços de outras pessoas, o seu nome é retirado dos
        registros. Registros de acesso podem ser guardados pelo prazo exigido em lei.
      </p>
      <h2>6. Seus direitos</h2>
      <p>Você pode, a qualquer momento:</p>
      <ul>
        <li>ver e corrigir seus dados (Meu perfil);</li>
        <li>baixar uma cópia dos seus dados (Meu perfil → Baixar meus dados);</li>
        <li>excluir a sua conta (Meu perfil → Excluir minha conta);</li>
        <li>tirar dúvidas ou fazer outros pedidos pelo contato abaixo.</li>
      </ul>
      <h2>7. Cookies</h2>
      <p>
        Usamos só o cookie necessário para manter você conectado (sessão). Não usamos cookies de publicidade nem de
        rastreamento.
      </p>
      {contato && (
        <>
          <h2>8. Contato</h2>
          <p>
            <a href={`mailto:${contato}`}>{contato}</a>
          </p>
        </>
      )}
    </Pagina>
  );
}
