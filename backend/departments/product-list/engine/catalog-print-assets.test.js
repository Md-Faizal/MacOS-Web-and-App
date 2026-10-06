const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { inflateRawSync } = require('node:zlib');
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
      id INTEGER PRIMARY KEY, variant_id INTEGER, batch_no TEXT, mrp REAL
    );
    INSERT INTO categories (id, name) VALUES (1, 'Care');
    INSERT INTO products (id, name, category_id) VALUES
      (10, 'Product With Batch', 1),
      (20, 'Product Without Batch', 1);
    INSERT INTO variants (id, product_id, pack_size_value, pack_size_type) VALUES
      (100, 10, '100', 'ml'),
      (101, 10, '200', 'ml'),
      (200, 20, '50', 'g');
    INSERT INTO batches (id, variant_id, batch_no, mrp) VALUES
      (1000, 100, 'B-10', 42.5);
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

function readZipEntries(buffer) {
  const entries = new Map();
  for (let offset = 0; offset + 46 <= buffer.length;) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      offset++;
      continue;
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const filenameStart = offset + 46;
    const filename = buffer.subarray(filenameStart, filenameStart + filenameLength).toString('utf8');
    const localFilenameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const contentStart = localHeaderOffset + 30 + localFilenameLength + localExtraLength;
    const compressed = buffer.subarray(contentStart, contentStart + compressedSize);
    const content = method === 8 ? inflateRawSync(compressed) : compressed;
    entries.set(filename, content);
    offset = filenameStart + filenameLength + extraLength + commentLength;
  }
  return entries;
}

test('renders stable QR identities as a Rust PDF label sheet from current catalog rows', async () => {
  const db = createDatabase();
  const originalRenderer = SuiteCoreBridge.renderCatalogQrLabelPdf;
  let rustRequest;
  const expectedPdf = Buffer.from('%PDF-1.4\n%%EOF\n');
  SuiteCoreBridge.renderCatalogQrLabelPdf = request => {
    rustRequest = request;
    return {
      success: true,
      pdf_base64: expectedPdf.toString('base64'),
      byte_count: expectedPdf.length,
      label_count: request.labels.length
    };
  };

  try {
    const handler = createProductHandlers(db).generateCatalogPrintAssets;
    const { response, buffer } = await collectResponse(handler, {
      format: 'pdf',
      baseUrl: 'https://catalog.example'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/pdf');
    assert.deepEqual(buffer, expectedPdf);
    assert.equal(rustRequest.labels.length, 2);
    assert.equal(rustRequest.labels[0].product_id, '10');
    assert.equal(rustRequest.labels[0].batch_no, 'B-10');
    assert.match(
      rustRequest.labels[0].qr_rows.join(''),
      /^[01]+$/
    );
    assert.equal(rustRequest.labels[1].product_id, '20');
    assert.equal(rustRequest.labels[1].batch_no, '');
    assert.equal(rustRequest.labels[1].mrp, null);
    assert.equal(rustRequest.labels[1].qr_rows.length, rustRequest.labels[1].qr_rows[0].length);
  } finally {
    SuiteCoreBridge.renderCatalogQrLabelPdf = originalRenderer;
    db.close();
  }
});

test('rejects non-public QR origins before rendering', async () => {
  const db = createDatabase();
  const originalRenderer = SuiteCoreBridge.renderCatalogQrLabelPdf;
  SuiteCoreBridge.renderCatalogQrLabelPdf = () => {
    throw new Error('Renderer must not be called for an invalid origin');
  };
  try {
    const handler = createProductHandlers(db).generateCatalogPrintAssets;
    const { response } = await collectResponse(handler, {
      format: 'pdf',
      baseUrl: 'http://localhost:5173'
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.body.error, /HTTPS|local host/i);
  } finally {
    SuiteCoreBridge.renderCatalogQrLabelPdf = originalRenderer;
    db.close();
  }
});

test('packages PDF and scalable QR SVG files into the designer ZIP', async () => {
  const db = createDatabase();
  const originalRenderer = SuiteCoreBridge.renderCatalogQrLabelPdf;
  const expectedPdf = Buffer.from('%PDF-1.4\n%%EOF\n');
  SuiteCoreBridge.renderCatalogQrLabelPdf = () => ({
    success: true,
    pdf_base64: expectedPdf.toString('base64'),
    byte_count: expectedPdf.length,
    label_count: 2
  });
  try {
    const handler = createProductHandlers(db).generateCatalogPrintAssets;
    const { response, buffer } = await collectResponse(handler, {
      format: 'zip',
      baseUrl: 'https://catalog.example'
    });
    const entries = readZipEntries(buffer);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/zip');
    assert.equal(buffer.readUInt32LE(0), 0x04034b50);
    assert.ok(entries.has('UCA_QR_Label_Sheets.pdf'));
    assert.ok(entries.has('labels.csv'));
    assert.ok(entries.has('README.txt'));
    assert.ok(entries.has('qrs/product-10-batch-1000.svg'));
    assert.ok(entries.has('qrs/product-20.svg'));
    const batchSvg = entries.get('qrs/product-10-batch-1000.svg').toString('utf8');
    assert.match(batchSvg, /viewBox="0 0 \d+ \d+"/);
    assert.match(batchSvg, /<path d="M/);
    assert.match(batchSvg, /fill="#000"/);
    assert.match(entries.get('labels.csv').toString('utf8'), /batch_id/);
    assert.match(entries.get('labels.csv').toString('utf8'), /batch_id=1000/);
  } finally {
    SuiteCoreBridge.renderCatalogQrLabelPdf = originalRenderer;
    db.close();
  }
});
