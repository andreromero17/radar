// Cria server/.env a partir do .env.example na primeira instalação.
import fs from 'node:fs';

const target = 'server/.env';
if (!fs.existsSync(target)) {
  fs.copyFileSync('server/.env.example', target);
  console.log(`✔ ${target} criado a partir do .env.example`);
}
