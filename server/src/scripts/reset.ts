// npm run reset — wipe local learning state (bandit, memory, events, sessions, curriculum, profile, the agent's skills/recipes/change log) in server/data/.
import fs from 'node:fs';
import { FILES } from '../store.js';

for (const f of Object.values(FILES)) {
  if (fs.existsSync(f)) {
    fs.rmSync(f);
    console.log(`removed ${f}`);
  }
}
console.log('Reset done. Restart the server (it caches open sessions in memory; the vector index is re-synced from these files on start).');
