// =============================================================================
// Carrega os dados do piloto (19/11/2026) no banco de UM espaço. Pode rodar mais de uma vez: não duplica.
//
//   npx tsx server/src/app/scripts/importar-piloto.ts               → espaço 1
//   npx tsx server/src/app/scripts/importar-piloto.ts --espaco 2    → outro espaço
// =============================================================================
import { config } from '../../config';
import { abrirPlataforma, opcoesEspacos } from '../../db/conexao';
import { abrirEspaco, configurarEspacos, fecharEspacos } from '../../espacos';
import { importarPiloto } from '../services/piloto';

const iArg = process.argv.indexOf('--espaco');
const espacoId = iArg > 0 ? Number(process.argv[iArg + 1]) : 1;
if (!Number.isInteger(espacoId) || espacoId < 1) throw new Error('--espaco precisa de um número');

const plataforma = abrirPlataforma(config);
configurarEspacos({ plataforma, ...opcoesEspacos(config), autoMigrar: false });
const db = await abrirEspaco(espacoId);
const r = await importarPiloto(db);
console.log(
  `✔ Piloto importado no espaço ${espacoId}: ${r.empresas} empresa(s), ${r.pessoas} pessoa(s), ` +
    `${r.publicacoes} publicação(ões), ${r.sinais} sinal(is), ${r.alertas} alerta(s) novos.`,
);
await fecharEspacos();
await plataforma.destroy();
