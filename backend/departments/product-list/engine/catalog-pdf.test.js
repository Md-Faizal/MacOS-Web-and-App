const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const Database = require('better-sqlite3');
const SuiteCoreBridge = require('../../../../frontend/shared/suite_core_bridge.js');
const createProductHandlers = require('./handlers');

function createDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE activity_log (
      user_id TEXT, platform TEXT, module TEXT, action TEXT, resource_type TEXT,
      resource_id TEXT, resource_name TEXT, metadata TEXT, ip_address TEXT,
      user_agent TEXT, created_at TEXT
    );
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE products (
      id INTEGER PRIMARY KEY, name TEXT, odia_name TEXT, category_id INTEGER
    );
    CREATE TABLE variants (
      id INTEGER PRIMARY KEY, product_id INTEGER, pack_size_value TEXT, pack_size_type TEXT
    );
    CREATE TABLE batches (
      id INTEGER PRIMARY KEY, variant_id INTEGER, batch_no TEXT, mrp REAL, mfg_date TEXT, exp_date TEXT
    );
    INSERT INTO categories (id, name) VALUES (1, 'Antibiotics'), (2, 'Analgesics');
    INSERT INTO products (id, name, category_id) VALUES
      (10, 'Amoxicillin and Potassium Clavulanate Tablets IP 625mg', 1),
      (20, 'Paracetamol Paediatric Suspension', 2);
    INSERT INTO variants (id, product_id, pack_size_value, pack_size_type) VALUES
      (100, 10, '10', 'Strips'),
      (200, 20, '60', 'ml');
    INSERT INTO batches (id, variant_id, batch_no, mrp, mfg_date, exp_date) VALUES
      (1000, 100, 'AMX-001', 185.50, '01/26', '12/27'),
      (2000, 200, 'PCM-002', 42.00, '02/26', '01/28');
  `);
  return db;
}

function createResponse() {
  const response = new PassThrough();
  response.statusCode = 200;
  response.headers = {};
  response.status = function(code) {
    this.statusCode = code;
    return this;
  };
  response.setHeader = function(name, value) {
    this.headers[name.toLowerCase()] = value;
  };
  response.json = function(value) {
    this.headers['content-type'] = 'application/json';
    this.body = value;
    this.end(JSON.stringify(value));
    return this;
  };
  return response;
}

async function collectResponse(handler, body) {
  const response = createResponse();
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    response.once('finish', resolve);
    response.once('error', reject);
  });
  await handler({ body }, response);
  await finished;
  return { response, buffer: Buffer.concat(chunks) };
}

test('generates full Rust Master Catalog PDF via generateCatalogPDF without Puppeteer', async () => {
  const db = createDatabase();
  try {
    const handler = createProductHandlers(db).generateCatalogPDF;
    const { response, buffer } = await collectResponse(handler, {
      action: 'download',
      filename: 'UCA_Master_Catalog.pdf'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/pdf');
    assert.ok(buffer.length > 500);
    assert.equal(buffer.subarray(0, 8).toString('utf8'), '%PDF-1.4');
    const pdfStr = buffer.toString('binary');
    assert.ok(pdfStr.includes('%%EOF'));
    assert.ok(pdfStr.includes('UCA INVENTORY SYSTEM'));
  } finally {
    db.close();
  }
});

test('generates Rust single batch QR PDF via generateCatalogPDF with structured payload', async () => {
  const db = createDatabase();
  try {
    const handler = createProductHandlers(db).generateCatalogPDF;
    const { response, buffer } = await collectResponse(handler, {
      action: 'download',
      filename: 'UCA_Batch_AMX_001_QR.pdf',
      catalog_data: {
        catalog_type: 'batch',
        generated_at: '2026-10-07',
        base_url: 'https://catalog.example.com',
        single_batch: {
          product_id: '10',
          product_name: 'Amoxicillin and Potassium Clavulanate Tablets IP 625mg',
          pack_size: '10 Strips',
          batch_no: 'AMX-001',
          mrp: 185.50,
          mfg_date: '01/26',
          expiry_date: '12/27'
        }
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/pdf');
    assert.ok(buffer.length > 500);
    assert.equal(buffer.subarray(0, 8).toString('utf8'), '%PDF-1.4');
    const pdfStr = buffer.toString('binary');
    assert.ok(pdfStr.includes('Batch QR Code'));
    assert.ok(pdfStr.includes('AMX-001'));
  } finally {
    db.close();
  }
});
