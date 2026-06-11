/**
 * Atualiza dataProtocolo nos registros existentes a partir do CSV DILIGÊNCIAS-COLARDADOS.csv
 * Só atualiza registros onde dataProtocolo IS NULL.
 * Não toca em nenhum outro campo.
 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const { parse } = require('csv-parse/sync');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const CSV_PATH = '/home/ubuntu/upload/DILIGÊNCIAS-COLARDADOS.csv';
const BATCH_SIZE = 500;

function parseDateStr(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parts = raw.split(/[\/\-]/);
  if (parts.length === 3) {
    let [a, b, c] = parts.map(Number);
    if (c < 100) c += 2000;
    if (c > 31) return `${c}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}`;
    return `${c}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}`;
  }
  return null;
}

function cleanDoc(str) {
  return str ? str.replace(/\D/g, '') : '';
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH);
  const rows = parse(raw, { encoding:'utf8', bom:true, relax_column_count:true, skip_empty_lines:true });
  const headers = rows[0];
  const dataIdx = headers.findIndex(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim() === 'data protocolo');
  const protoIdx = headers.findIndex(h => h.toLowerCase().trim() === 'protocolo');
  const docIdx = headers.findIndex(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().includes('cpf') || h.toLowerCase().trim().includes('cnpj') || h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim() === 'cpf/cnpj devedor');

  console.log(`Headers found: protocolo=[${protoIdx}], data protocolo=[${dataIdx}], doc=[${docIdx}]`);
  console.log(`Total data rows: ${rows.length - 1}`);

  // Build map: protocolo -> date
  const protoDateMap = new Map();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const proto = (row[protoIdx] || '').trim();
    const dateRaw = (row[dataIdx] || '').trim();
    if (proto && dateRaw) {
      const parsed = parseDateStr(dateRaw);
      if (parsed && !protoDateMap.has(proto)) {
        protoDateMap.set(proto, parsed);
      }
    }
  }

  console.log(`Unique protocols with dates: ${protoDateMap.size}`);

  const conn = await mysql.createConnection(DB_URL);
  console.log('Connected to DB');

  // Update in batches
  const entries = Array.from(protoDateMap.entries());
  let totalUpdated = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    // Use CASE WHEN for batch update
    const cases = batch.map(() => 'WHEN protocolo = ? THEN ?').join(' ');
    const protos = batch.map(([p]) => p);
    const vals = batch.flatMap(([p, d]) => [p, d]);
    const placeholders = protos.map(() => '?').join(',');

    const sql = `UPDATE protocolos SET dataProtocolo = CASE ${cases} END WHERE protocolo IN (${placeholders}) AND dataProtocolo IS NULL`;
    
    try {
      const [result] = await conn.execute(sql, [...vals, ...protos]);
      totalUpdated += result.affectedRows || 0;
    } catch(e) {
      console.error(`Batch error at ${i}:`, e.message);
    }

    if (i % 5000 === 0) console.log(`  ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length}...`);
  }

  await conn.end();

  console.log('\n=== Summary ===');
  console.log(`Protocols in CSV with dates: ${protoDateMap.size}`);
  console.log(`Rows updated in DB:          ${totalUpdated}`);
}

main().catch(console.error);
