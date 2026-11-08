import type { FieldErrors } from '@frame/shared';

/** Erro com status HTTP; o tratador de erros do app devolve { error, errors?, code? } */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: FieldErrors,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, fields?: FieldErrors) => new HttpError(422, msg, fields);
export const forbidden = (msg = 'Você não tem permissão para esta ação') => new HttpError(403, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
