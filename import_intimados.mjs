import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const { parse } = require('csv-parse/sync');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const CSV_PATH = '/home/ubuntu/upload/Planilhasemtítulo-Página1.csv';
const BATCH_SIZE = 500;
const ESCREVENTES = new Set(['helenita', 'samuel', 'mayara', 'thaiana', 'vanessa', 'anita', 'maiara']);

function parseDate(str) {
  if (!str || !str.trim()) return null;
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

function cleanDoc(str) {
  return str ? str.replace(/\D/g, '') : '';
}

function detectCanal(obs, notif, status) {
  const o = (obs||'').toLowerCase();
  const n = (notif||'').toLowerCase().trim();
  const s = (status||'').toLowerCase().trim();
  if (o.includes('intimação eletrônica') || o.includes('intimacao eletronica')) return 'SMS';
  if (o.includes('whatsapp')) {
    const m = obs.replace(/\s/g,'').match(/WHATSAPP[-:]?(\d+)/i);
    return m ? `WhatsApp (${m[1]})` : 'WhatsApp';
  }
  if (o.includes('balcão') || o.includes('balcao') || o.includes('balção')) return 'Balcão';
  if (o.includes('aceito') || o.includes('recusado') || o.includes('mudou') ||
      o.includes('endereço') || o.includes('endereco') || o.includes('inexistente') ||
      o.includes('diligência') || o.includes('diligencia') || o.includes('pessoal')) return 'Pessoal';
  if (ESCREVENTES.has(n) || ESCREVENTES.has(s)) return 'Balcão';
  return 'Pessoal';
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH);
  const rows = parse(raw, { encoding:'utf8', bom:true, relax_column_count:true, skip_empty_lines:true });
  console.log(`Total rows in CSV: ${rows.length}`);

  const seen = new Set();
  const records = [];

  for (const row of rows) {
    const protocolo = (row[0]||'').trim();
    if (!protocolo) continue;
    const doc = cleanDoc(row[2]||'');
    const obs = (row[3]||'').trim();
    const notif = (row[5]||'').trim();
    const key = `${protocolo}|${doc}|${obs}|${notif}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      protocolo,
      doc: doc || null,
      tipoDoc: doc.length===11?'CPF':doc.length===14?'CNPJ':'INVALIDO',
      nome: (row[4]||'').trim() || null,
      canal: detectCanal(obs, notif, row[6]||''),
      intimadoEm: parseDate(row[1]||''),
    });
  }

  console.log(`Unique records: ${records.length}`);
  const conn = await mysql.createConnection(DB_URL);
  console.log('Connected to DB');

  let totalAffected = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const ph = batch.map(() => '(?,?,?,?,\'intimado\',?,?,\'Planilhasemtítulo-Página1.csv\',NOW(),NOW())').join(',');
    const vals = [];
    for (const r of batch) vals.push(r.protocolo, r.doc, r.tipoDoc, r.nome, r.intimadoEm, r.canal);
    const sql = `INSERT INTO protocolos (protocolo,documento,tipoDoc,nomeDevedor,statusIntimacao,intimadoEm,canalIntimacao,nomeArquivo,createdAt,updatedAt) VALUES ${ph} ON DUPLICATE KEY UPDATE statusIntimacao='intimado', intimadoEm=COALESCE(intimadoEm,VALUES(intimadoEm)), canalIntimacao=COALESCE(canalIntimacao,VALUES(canalIntimacao)), nomeDevedor=COALESCE(nomeDevedor,VALUES(nomeDevedor)), updatedAt=NOW()`;
    try {
      const [r] = await conn.execute(sql, vals);
      totalAffected += r.affectedRows||0;
    } catch(e) { console.error(`Batch ${Math.floor(i/BATCH_SIZE)+1} error:`, e.message); }
    if (i % 5000 === 0) console.log(`  ${Math.min(i+BATCH_SIZE,records.length)}/${records.length}...`);
  }

  await conn.end();
  console.log('\n=== Summary ===');
  console.log(`CSV rows: ${rows.length} | Unique: ${records.length} | DB affected: ${totalAffected}`);
}

main().catch(console.error);
