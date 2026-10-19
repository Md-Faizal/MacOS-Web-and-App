/**
 * Test Suite: Vault Document Multi-Format Export Verification
 * Tests document export for documents in company_vault_documents across all 3 formats:
 * - PDF (application/pdf, starts with %PDF)
 * - Word (application/vnd.openxmlformats-officedocument.wordprocessingml.document, starts with PK\x03\x04)
 * - High-Res JPEG (image/jpeg, starts with \xFF\xD8\xFF)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

function requestBinary(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          contentDisposition: res.headers['content-disposition'],
          contentLength: buffer.length,
          buffer: buffer
        });
      });
    }).on('error', reject);
  });
}

function checkFormatSignature(buffer, format) {
  if (format === 'pdf') {
    return buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === '%PDF';
  } else if (format === 'docx') {
    return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
  } else if (format === 'jpeg' || format === 'jpg') {
    return buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  return false;
}

async function runExportTests() {
  console.log('========================================================================');
  console.log('  VAULT DOCUMENT MULTI-FORMAT EXPORT VERIFICATION TEST');
  console.log('========================================================================\n');

  const docId = 1; // Native letterhead statutory document: "Appointment Letter - Chief Ayurvedic Medical Officer"
  const formats = ['pdf', 'docx', 'jpeg'];
  const testResults = [];

  for (const fmt of formats) {
    const url = `http://localhost:5173/api/compliance/vault/documents/${docId}/${fmt}`;
    console.log(`[*] Requesting /api/compliance/vault/documents/${docId}/${fmt}...`);
    try {
      const res = await requestBinary(url);
      const isSignatureValid = checkFormatSignature(res.buffer, fmt);
      
      const result = {
        format: fmt.toUpperCase(),
        statusCode: res.statusCode,
        contentType: res.contentType,
        contentDisposition: res.contentDisposition,
        contentLength: res.contentLength,
        isSignatureValid,
        pass: res.statusCode === 200 && isSignatureValid && res.contentLength > 1000
      };

      testResults.push(result);

      console.log(`  -> Status Code       : ${res.statusCode}`);
      console.log(`  -> Content-Type      : ${res.contentType}`);
      console.log(`  -> Disposition       : ${res.contentDisposition}`);
      console.log(`  -> Payload Size      : ${res.contentLength.toLocaleString()} bytes`);
      console.log(`  -> Binary Signature  : ${isSignatureValid ? 'VALID (' + fmt.toUpperCase() + ' MAGIC BYTES)' : 'INVALID'}`);
      console.log(`  -> Verdict           : ${result.pass ? 'PASS [OK]' : 'FAIL [ERROR]'}\n`);
    } catch (err) {
      console.error(`  -> Request Failed    : ${err.message}\n`);
      testResults.push({ format: fmt.toUpperCase(), pass: false, error: err.message });
    }
  }

  console.log('------------------------------------------------------------------------');
  console.log('  TEST SUMMARY');
  console.log('------------------------------------------------------------------------');
  let allPassed = true;
  for (const r of testResults) {
    console.log(`  ${r.format.padEnd(6)} : ${r.pass ? 'PASS' : 'FAIL'} (${r.contentLength ? r.contentLength.toLocaleString() + ' bytes' : r.error})`);
    if (!r.pass) allPassed = false;
  }
  console.log('========================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runExportTests();
