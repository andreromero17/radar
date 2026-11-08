import nodemailer from 'nodemailer';
import type { Logger } from 'pino';

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
      await transport.sendMail({ from: cfg.SMTP_FROM, ...mail });
    },
  };
}

/** Mailer de testes: guarda os e-mails em memória */
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}
