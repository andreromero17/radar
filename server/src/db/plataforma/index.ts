// Migrações só do banco da PLATAFORMA (usuários, sessões, espaços, membros). O banco de cada espaço não as recebe.
import type { Migration } from '../migrator';
import * as m20261114000000 from './20261114000000_espacos';
import * as m20261115000000 from './20261115000000_convites';
import * as m20261116000000 from './20261116000000_suporte_2fa';
import * as m20261117000000 from './20261117000000_cadastro_lgpd';
import * as m20261118000000 from './20261118000000_espaco_modelo';

export const plataformaMigrations: Migration[] = [
  m20261114000000,
  m20261115000000,
  m20261116000000,
  m20261117000000,
  m20261118000000,
];
