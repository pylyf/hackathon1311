// npm run vector:setup — fetch everything the vector memory needs ahead of time (e.g. before a demo on bad wifi):
// the Qdrant binary for this OS/CPU and the embedding model. The server does the same by itself on first start.
import { QDRANT_URL } from '../config.js';
import { embed, EMBED_MODEL, ensureModel } from '../vector/embed.js';
import { ensureQdrantBinary, QDRANT_VERSION } from '../vector/qdrantProcess.js';

const log = (m: string) => console.log(m);
if (QDRANT_URL) console.log(`QDRANT_URL is set (${QDRANT_URL}): no local Qdrant binary needed.`);
else console.log(`Qdrant ${QDRANT_VERSION} ready: ${await ensureQdrantBinary(log)}`);
await ensureModel(log);
const v = await embed('one quarter plus one quarter');
console.log(`Embedding model ${EMBED_MODEL} ready (${v.length} dims).`);
process.exit(0);
