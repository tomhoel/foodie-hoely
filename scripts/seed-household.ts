import 'dotenv/config';
import { getOrCreateDefaultHousehold } from '../src/db/repositories/households.repo';

(async () => {
  const hh = await getOrCreateDefaultHousehold();
  console.log(JSON.stringify({ id: hh.id, name: hh.name, created_at: hh.created_at }, null, 2));
})().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
