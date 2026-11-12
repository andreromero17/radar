// Migrações só do banco da PLATAFORMA (usuários, sessões, espaços, membros). O banco de cada espaço não as recebe.
import type { Migration } from '../migrator';
import * as m20261114000000 from './20261114000000_espacos';
import * as m20261115000000 from './20261115000000_convites';

export const plataformaMigrations: Migration[] = [m20261114000000, m20261115000000];
