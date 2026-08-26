const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

let browserInstance = null;

/**
 * Gets or initializes a reusable Puppeteer browser instance
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--font-render-hinting=medium'
      ]
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    try {
      browserInstance = await puppeteer.launch(launchOptions);
    } catch (err) {
      console.error('[PDF Generator] Primary bundled Chromium launch failed, trying system fallback:', err.message);
      
      // Fallback 1: check system chromium paths on Linux / Ubuntu VM
      if (process.platform === 'linux' && !launchOptions.executablePath) {
        const possiblePaths = [
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/usr/bin/google-chrome',
          '/snap/bin/chromium'
        ];
        for (const exePath of possiblePaths) {
          if (fs.existsSync(exePath)) {
            launchOptions.executablePath = exePath;
            break;
          }
        }
      }

      // Fallback 2: add --single-process for memory constrained VM environments
      if (!launchOptions.args.includes('--single-process')) {
        launchOptions.args.push('--single-process');
      }

      try {
        browserInstance = await puppeteer.launch(launchOptions);
      } catch (err2) {
        console.error('[PDF Generator] Fallback Chromium launch failed:', err2.message);
        throw new Error(`Failed to launch Chromium engine: ${err2.message}`);
      }
    }
  }
  return browserInstance;
}

/**
 * Generates an A4 zero-margin PDF Buffer from HTML content
 * @param {string} htmlContent - The body HTML of the catalog
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generatePDFFromHTML(htmlContent) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport for consistent layout rendering
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });

    // Load QR styles directly into head style tag with production path resolution
    const possibleCssPaths = [
      path.join(__dirname, '../../../frontend/modules/product-list/css/qr-styles.css'),
      path.join(__dirname, '../../../../frontend/modules/product-list/css/qr-styles.css'),
      path.join(process.cwd(), 'frontend/modules/product-list/css/qr-styles.css'),
      path.join(process.cwd(), 'dist/frontend/modules/product-list/css/qr-styles.css')
    ];
    let qrCss = '';
    for (const cssPath of possibleCssPaths) {
      if (fs.existsSync(cssPath)) {
        qrCss = fs.readFileSync(cssPath, 'utf8');
        break;
      }
    }

    const completeHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800;900&display=swap" rel="stylesheet">
        <style>
          ${qrCss}
          
          /* Ensure zero margin full-bleed print rendering in Puppeteer */
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
          body, html {
            margin: 0 !important;
            padding: 0 !important;
            background: #f4f6fb !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .qr-print-container {
            display: block !important;
            position: relative !important;
            visibility: visible !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .qr-print-container * {
            visibility: visible !important;
          }
        </style>
      </head>
      <body>
        <div class="qr-print-container">
          ${htmlContent}
        </div>
      </body>
      </html>
    `;

    try {
      await page.setContent(completeHtml, { waitUntil: ['load', 'domcontentloaded'], timeout: 60000 });
    } catch (e) {
      console.warn('[PDF Generator] Notice: setContent timeout warning, proceeding with render:', e.message);
    }
    
    // Wait for fonts to finish loading
    try {
      await page.evaluate(() => document.fonts.ready);
    } catch (e) {
      // Font wait timeout fallback
    }

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
      displayHeaderFooter: false
    });

    return pdfBuffer;
  } finally {
    await page.close();
  }
}

module.exports = {
  generatePDFFromHTML
};
