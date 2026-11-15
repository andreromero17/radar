import nodemailer from 'nodemailer';
import type { Logger } from 'pino';
import { HttpError } from '../utils/http';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export interface SmtpConfig {
  SMTP_HOST?: string;
  SMTP_PORT: number;
  smtpSecure: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM: string;
}

/**
 * Falha do servidor de e-mail (senha errada, servidor fora do ar...). 502 com mensagem clara em vez de "Erro
 * interno"; o motivo técnico fica no log. Quem chama pode trocar a mensagem (ex.: "o convite foi registrado").
 */
export class EmailNaoEnviado extends HttpError {
  constructor(
    message = 'Não foi possível enviar o e-mail. Verifique a configuração de e-mail do servidor e tente de novo.',
  ) {
    super(502, message, undefined, 'EMAIL_FALHOU');
  }
}

/** SMTP se configurado; senão, escreve o e-mail no log (útil em desenvolvimento). */
export function createMailer(cfg: SmtpConfig, logger: Logger): Mailer {
  if (!cfg.SMTP_HOST) {
    return {
      async send(mail) {
        logger.warn(
          `\n────────── E-MAIL (SMTP não configurado) ──────────\nPara: ${mail.to}\nAssunto: ${mail.subject}\n\n${mail.text}\n────────────────────────────────────────────────────`,
        );
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.smtpSecure,
    auth: cfg.SMTP_USER ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined,
  });
  return {
    async send(mail) {
      try {
        await transport.sendMail({ from: cfg.SMTP_FROM, ...mail });
      } catch (err) {
        const e = err as { code?: string; responseCode?: number; message?: string };
        logger.error(
          { para: mail.to, assunto: mail.subject, codigo: e.code, resposta: e.responseCode, motivo: e.message },
          'falha ao enviar e-mail',
        );
        throw new EmailNaoEnviado();
      }
    },
  };
}

/** Mailer de testes: guarda os e-mails em memória; `falhar = true` simula o servidor de e-mail recusando */
export function memoryMailer(): Mailer & { sent: Mail[]; falhar: boolean } {
  const sent: Mail[] = [];
  const m = {
    sent,
    falhar: false,
    async send(mail: Mail) {
      if (m.falhar) throw new EmailNaoEnviado();
      sent.push(mail);
    },
  };
  return m;
}
