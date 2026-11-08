import pino from 'pino';
import { config } from './config';

/** Logger estruturado: JSON em produção, colorido e legível em desenvolvimento. */
export const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
});

export type Logger = typeof logger;
