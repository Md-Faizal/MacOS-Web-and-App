// Dynamic Calendar Icon Generator
function generateUltimateMacIcon(canvasId, size = 256) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;

    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const dayNumber = now.getDate().toString();

    // Scale values based on canvas size
    const scale = size / 256;

    // 1. Base Squircle
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 56 * scale);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 2. Day Name Text (More Visible)
    ctx.fillStyle = "#FF3B30";
    ctx.font = `bold ${56 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "1px";
    // Add soft shadow for depth without sharpness
    ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
    ctx.shadowBlur = 4 * scale;
    ctx.shadowOffsetY = 1;
    ctx.fillText(dayName, size / 2, 70 * scale);
    ctx.shadowColor = "transparent";

    // 3. The Number: Smoother, More Visible
    const x = size / 2;
    const y = 175 * scale;
    const fontSize = `${135 * scale}px`;
    const fontStack = `600 ${fontSize} system-ui, -apple-system, sans-serif`;
    
    ctx.font = fontStack;
    ctx.textBaseline = "middle";
    ctx.letterSpacing = `-${8 * scale}px`;

    // A. Soft shadow for depth
    ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
    ctx.shadowBlur = 12 * scale;
    ctx.shadowOffsetY = 6 * scale;
    ctx.fillStyle = "#1c1c1e";
    ctx.fillText(dayNumber, x, y);
    ctx.shadowColor = "transparent";

    // B. Softer highlight (less harsh)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeText(dayNumber, x - 0.6 * scale, y - 0.8 * scale);
    
    // C. Subtle inset shadow (smoother)
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 0.8 * scale;
    ctx.strokeText(dayNumber, x + 0.4 * scale, y + 0.5 * scale);

    // D. Gentle surface shine (less intense)
    const surfaceGrad = ctx.createLinearGradient(0, 100 * scale, 0, 220 * scale);
    surfaceGrad.addColorStop(0, "rgba(255, 255, 255, 0.06)");
    surfaceGrad.addColorStop(0.5, "rgba(255, 255, 255, 0)");
    surfaceGrad.addColorStop(1, "rgba(0, 0, 0, 0.05)");
    
    ctx.fillStyle = surfaceGrad;
    ctx.fillText(dayNumber, x, y);

    // E. Soft subtle outline
    ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
    ctx.lineWidth = 0.3 * scale;
    ctx.strokeText(dayNumber, x, y);
}

// Make function globally accessible
window.generateUltimateMacIcon = generateUltimateMacIcon;
