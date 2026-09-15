import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  console.log('Migration complete: schema applied to', process.env.DATABASE_FILE || './data/sih.db');
}

migrate();
