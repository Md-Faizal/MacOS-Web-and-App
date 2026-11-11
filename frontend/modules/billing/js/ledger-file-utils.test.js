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

test('exportToLocation clears stale directory NotFoundError handle and falls back cleanly', async () => {
  const removed = [];
  let downloadedName = null;
  const origGetHandle = LedgerFileUtils.getHandle;
  const origRemoveHandle = LedgerFileUtils.removeHandle;
  const origFallback = LedgerFileUtils.fallbackDownload;
  const origPicker = context.window.showSaveFilePicker;

  try {
    LedgerFileUtils.getHandle = async () => ({
      name: 'DeletedFolder',
      async queryPermission() { return 'granted'; },
      async getFileHandle() {
        const err = new Error('A requested file or directory could not be found at the time an operation was processed.');
        err.name = 'NotFoundError';
        throw err;
      }
    });
    LedgerFileUtils.removeHandle = async (customer) => { removed.push(customer); };
    context.window.showSaveFilePicker = async () => {
      const err = new Error('User activation is required to request the file picker.');
      err.name = 'SecurityError';
      throw err;
    };
    LedgerFileUtils.fallbackDownload = (name) => { downloadedName = name; };

    const result = await LedgerFileUtils.exportToLocation('Test Customer', '1.Invoice/2026:11.pdf', new Blob(['pdf']));
    assert.deepEqual(removed, ['Test Customer']);
    assert.equal(result.success, true);
    assert.equal(result.fallback, true);
    assert.equal(result.staleFolderCleared, true);
    assert.equal(downloadedName, '1.Invoice_2026_11.pdf');
  } finally {
    LedgerFileUtils.getHandle = origGetHandle;
    LedgerFileUtils.removeHandle = origRemoveHandle;
    LedgerFileUtils.fallbackDownload = origFallback;
    context.window.showSaveFilePicker = origPicker;
  }
});
