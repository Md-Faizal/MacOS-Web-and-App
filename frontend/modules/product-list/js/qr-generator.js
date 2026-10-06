export class QRGenerator {
  constructor() {
    this.scriptLoaded = false;
    this.loadPromise = this.loadQRCodeScript();
  }

  loadQRCodeScript() {
    return new Promise((resolve, reject) => {
      if (window.QRCode) {
        this.scriptLoaded = true;
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = '/modules/product-list/js/qrcode.min.js';
      script.onload = () => {
        this.scriptLoaded = true;
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load QRCode library.'));
      };
      document.head.appendChild(script);
    });
  }

  async generateQRCodeDataURL(url, size = 'medium') {
    await this.loadPromise;
    
    // Determine size in pixels
    let width = 200;
    if (size === 'small') {
      width = 100;
    } else if (size === 'large') {
      width = 400;
    }

    // Generate basic QR code canvas
    const canvas = document.createElement('canvas');
    await window.QRCode.toCanvas(canvas, url, {
      width: width,
      margin: 4,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    return canvas.toDataURL('image/png');
  }

  generateProductURL(sku) {
    const baseUrl = window.location.origin;
    return `${baseUrl}/public/product/${encodeURIComponent(sku)}`;
  }

  generateBatchURL(batchNo, productId = null, variantId = null, batchId = null) {
    const baseUrl = window.location.origin;
    const url = new URL(`/public/batch/${encodeURIComponent(batchNo)}`, baseUrl);
    if (productId !== null && productId !== undefined) url.searchParams.set('sku', String(productId));
    if (variantId !== null && variantId !== undefined) url.searchParams.set('variant_id', String(variantId));
    if (batchId !== null && batchId !== undefined) url.searchParams.set('batch_id', String(batchId));
    return url.toString();
  }
}
