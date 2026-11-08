import { db } from './db.js';
import { STATUS_CHAMADO } from './entities.js';

export function protocolo(date = new Date()) {
  const d = date.toISOString().slice(0, 10).replaceAll('-', '');
  const r = Math.random().toString(16).slice(2, 7).toUpperCase();
  return `CH${d}-${r}`;
}

/** Popula o banco com dados de exemplo, apenas se estiver vazio. */
export function seed() {
  const { n } = db.prepare('SELECT COUNT(*) n FROM clientes').get();
  if (n > 0) return;

  const clientes = [
    ['Cliente Teste Hugo', 'hugo@exemplo.com', '(51) 99999-0001', '123.456.789-00', 1],
    ['Novo Cliente de Teste', 'contato@novocliente.com', '(11) 98888-0002', '12.345.678/0001-90', 1],
    ['Padaria Bom Dia', 'financeiro@bomdia.com', '(51) 3333-4444', '98.765.432/0001-10', 1],
    ['Construtora Horizonte', 'ti@horizonte.com.br', '(11) 3222-1111', '45.678.901/0001-22', 1],
    ['Loja Antiga Ltda', 'loja@antiga.com', '(48) 3000-0000', '11.222.333/0001-44', 0],
  ];
  const usuarios = [
    ['Usuário Administrador', 'admin@sistema.com', 'Administrador', 1],
    ['Ana Souza', 'ana@sistema.com', 'Operador', 1],
    ['Bruno Lima', 'bruno@sistema.com', 'Operador', 1],
    ['Carla Dias', 'carla@sistema.com', 'Leitura', 0],
  ];
  const assuntos = [
    'Teste chamado', 'Novo chamado hoje', 'Chamado abertura teste', 'Chamado teste 2',
    'Erro ao emitir nota fiscal', 'Impressora não conecta', 'Acesso ao sistema bloqueado',
    'Lentidão no relatório mensal', 'Solicitação de novo usuário', 'Backup não executou',
    'Dúvida sobre integração', 'Atualização de cadastro', 'E-mail não sincroniza',
    'Instalação de software', 'Troca de senha', 'Falha na VPN',
  ];
  const prioridades = ['Baixa', 'Média', 'Média', 'Alta', 'Urgente'];

  const tx = db.transaction(() => {
    const insC = db.prepare('INSERT INTO clientes (nome,email,telefone,documento,ativo) VALUES (?,?,?,?,?)');
    clientes.forEach((c) => insC.run(...c));
    const insU = db.prepare('INSERT INTO usuarios (nome,email,perfil,ativo) VALUES (?,?,?,?)');
    usuarios.forEach((u) => insU.run(...u));

    const insCh = db.prepare(`INSERT INTO chamados
      (protocolo,assunto,prioridade,cliente_id,responsavel_id,status,descricao,criado_em)
      VALUES (?,?,?,?,?,?,?,?)`);
    const now = Date.now();
    for (let i = 0; i < 40; i++) {
      // distribui os chamados nos últimos ~45 dias, mais recentes no fim
      const date = new Date(now - (40 - i) * 26 * 3600 * 1000);
      const status = STATUS_CHAMADO[(i * 7) % STATUS_CHAMADO.length];
      const resp = i % 3 === 0 ? null : (i % 3) + 1;
      insCh.run(
        protocolo(date),
        assuntos[i % assuntos.length],
        prioridades[(i * 3) % prioridades.length],
        (i % 4) + 1,
        resp,
        status,
        'Chamado gerado automaticamente para demonstração.',
        new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '),
      );
    }
    db.prepare("INSERT INTO logs (entidade, acao, detalhe) VALUES ('sistema','seed','Banco populado com dados de exemplo')").run();
  });
  tx();
  console.log('🌱 Banco populado com dados de exemplo');
}
