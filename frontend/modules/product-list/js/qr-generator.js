import {
  createCatalogBatchQrUrl,
  createCatalogProductQrUrl,
  resolveCatalogQrBaseUrl
} from '../../../shared/catalog-qr-url.mjs';

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
    return createCatalogProductQrUrl(this.getBaseUrl(), sku);
  }

  generateBatchURL(batchNo, productId = null, variantId = null, batchId = null) {
    return createCatalogBatchQrUrl(this.getBaseUrl(), batchNo, productId, variantId, batchId);
  }

  getBaseUrl() {
    const configuredBaseUrl = import.meta.env?.VITE_PUBLIC_APP_URL || window.MACOS_PUBLIC_URL || '';
    return resolveCatalogQrBaseUrl(window.location.origin, configuredBaseUrl);
  }
}
