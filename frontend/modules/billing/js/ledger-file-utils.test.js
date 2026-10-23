const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'ledger-file-utils.js'), 'utf8');
const context = { window: {}, console };
vm.runInNewContext(source, context);
const LedgerFileUtils = context.window.LedgerFileUtils;

test('estimate exports increment names when a file already exists', async () => {
  const existingFiles = new Set([
    'Estimate_EST-260001.2026-10-24.pdf',
    'Estimate_EST-260001.2026-10-24 (1).pdf'
  ]);
  const directoryHandle = {
    async getFileHandle(name) {
      if (existingFiles.has(name)) return { name };
      const error = new Error('File does not exist');
      error.name = 'NotFoundError';
      throw error;
    }
  };

  assert.equal(
    await LedgerFileUtils.getAvailableFileName(directoryHandle, 'Estimate_EST-260001.2026-10-24.pdf'),
    'Estimate_EST-260001.2026-10-24 (2).pdf'
  );
});
