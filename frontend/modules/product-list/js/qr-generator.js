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
    let includeLogo = true;
    
    if (size === 'small') {
      width = 100;
      includeLogo = false; // As requested, NO logo for small
    } else if (size === 'large') {
      width = 400;
    }

    // Generate basic QR code canvas
    const canvas = document.createElement('canvas');
    await window.QRCode.toCanvas(canvas, url, {
      width: width,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    if (includeLogo) {
      const ctx = canvas.getContext('2d');
      const cw = canvas.width;
      const ch = canvas.height;
      
      // Calculate logo size
      const logoSize = Math.floor(cw * 0.28);
      const lx = Math.floor((cw - logoSize) / 2);
      const ly = Math.floor((ch - logoSize) / 2);

      // Draw Yellow background square for logo with black border (Neo-Brutalist)
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(lx, ly, logoSize, logoSize);
      
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(2, Math.floor(cw * 0.015));
      ctx.strokeRect(lx, ly, logoSize, logoSize);

      // Draw UCA Text Logo
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const fontSize = Math.floor(logoSize * 0.32);
      ctx.font = `900 ${fontSize}px "Plus Jakarta Sans", sans-serif`;

      const centerX = cw / 2;
      const centerY = (ch / 2) + (fontSize * 0.05); // slight optical adjustment
      const offset = fontSize;
      
      // Outer letters (Black)
      ctx.fillStyle = '#000000';
      ctx.fillText('U', centerX, centerY - offset); // Top
      ctx.fillText('U', centerX - offset, centerY); // Left
      ctx.fillText('A', centerX + offset, centerY); // Right
      ctx.fillText('A', centerX, centerY + offset); // Bottom

      // Center letter (Electric Blue)
      ctx.fillStyle = '#0038ff';
      ctx.fillText('C', centerX, centerY);
    }

    return canvas.toDataURL('image/png');
  }

  generateProductURL(sku) {
    const baseUrl = window.location.origin;
    return `${baseUrl}/public/product/${encodeURIComponent(sku)}`;
  }

  generateBatchURL(batchNo) {
    const baseUrl = window.location.origin;
    return `${baseUrl}/public/batch/${encodeURIComponent(batchNo)}`;
  }
}
