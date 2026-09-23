import React, { useEffect, useRef } from 'react';

interface DynamicHalftoneBackgroundProps {
  className?: string;
}

export const DynamicHalftoneBackground: React.FC<DynamicHalftoneBackgroundProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    // Track mouse with smooth interpolation
    const mouse = {
      x: -2000,
      y: -2000,
      targetX: -2000,
      targetY: -2000,
      active: false,
    };

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    handleResize();

    // ── Lower count & larger spacing (36px grid instead of 24px) ──
    const SPACING = 36;
    const startTime = performance.now();

    const render = (currentTime: number) => {
      // Smooth mouse position lerping
      if (mouse.active) {
        mouse.x += (mouse.targetX - mouse.x) * 0.14;
        mouse.y += (mouse.targetY - mouse.y) * 0.14;
      } else {
        mouse.x += (-2000 - mouse.x) * 0.05;
        mouse.y += (-2000 - mouse.y) * 0.05;
      }

      ctx.clearRect(0, 0, width, height);

      const elapsed = (currentTime - startTime) * 0.001;
      const cols = Math.ceil(width / SPACING) + 2;
      const rows = Math.ceil(height / SPACING) + 2;

      // ── Autonomous Wandering Energy Nodes (orbiting continuously without mouse) ──
      const node1X = width * (0.5 + 0.38 * Math.sin(elapsed * 0.55) * Math.cos(elapsed * 0.28));
      const node1Y = height * (0.5 + 0.36 * Math.cos(elapsed * 0.45) * Math.sin(elapsed * 0.33));
      const node2X = width * (0.5 + 0.34 * Math.cos(elapsed * 0.65 + 1.8));
      const node2Y = height * (0.5 + 0.36 * Math.sin(elapsed * 0.5 + 2.4));
      const NODE_RADIUS = 280;
      const MOUSE_RADIUS = 220;

      for (let r = 0; r < rows; r++) {
        const y = r * SPACING;
        // Vertical gradient progression matching user reference
        const yProgress = Math.max(0, Math.min(1, y / height));

        // ── Bigger dot radius: starts at 1.6px at top, grows to 9.0px at bottom ──
        const baseRadius = 1.6 + Math.pow(yProgress, 1.4) * 7.4;
        const baseAlpha = 0.32 + yProgress * 0.45;

        for (let c = 0; c < cols; c++) {
          const x = c * SPACING;

          // ── Multi-harmonic organic fluid drift (moves randomly without touching mouse) ──
          const wave1 = Math.sin(x * 0.009 + elapsed * 1.3) * Math.cos(y * 0.009 - elapsed * 1.1);
          const wave2 = Math.sin((x + y) * 0.007 - elapsed * 0.85) * Math.cos(x * 0.006 + elapsed * 0.7);
          const wave3 = Math.sin(x * 0.015 - y * 0.012 + elapsed * 1.6) * 0.5;

          const ambientDriftX = (wave1 * 0.65 + wave2 * 0.35 + wave3 * 0.2) * 6.5;
          const ambientDriftY = (wave2 * 0.65 - wave1 * 0.35 + wave3 * 0.2) * 6.5;
          const ambientScale = (wave1 + wave2) * 1.3;

          let drawX = x + ambientDriftX;
          let drawY = y + ambientDriftY;
          let radius = baseRadius + ambientScale;
          let alpha = baseAlpha;

          // ── Reaction to Autonomous Wandering Node 1 ──
          const n1dx = drawX - node1X;
          const n1dy = drawY - node1Y;
          const n1distSq = n1dx * n1dx + n1dy * n1dy;
          if (n1distSq < NODE_RADIUS * NODE_RADIUS) {
            const dist = Math.sqrt(n1distSq);
            const factor = Math.cos((dist / NODE_RADIUS) * (Math.PI / 2));
            radius += factor * 3.2;
            alpha += factor * 0.22;
            if (dist > 1) {
              drawX += (n1dx / dist) * factor * 5.0;
              drawY += (n1dy / dist) * factor * 5.0;
            }
          }

          // ── Reaction to Autonomous Wandering Node 2 ──
          const n2dx = drawX - node2X;
          const n2dy = drawY - node2Y;
          const n2distSq = n2dx * n2dx + n2dy * n2dy;
          if (n2distSq < NODE_RADIUS * NODE_RADIUS) {
            const dist = Math.sqrt(n2distSq);
            const factor = Math.cos((dist / NODE_RADIUS) * (Math.PI / 2));
            radius += factor * 2.8;
            alpha += factor * 0.2;
            if (dist > 1) {
              drawX += (n2dx / dist) * factor * 4.5;
              drawY += (n2dy / dist) * factor * 4.5;
            }
          }

          // ── Subtle Natural Dot Matrix Presence (No repulsive halo; shows actual dots in place) ──
          const mdx = drawX - mouse.x;
          const mdy = drawY - mouse.y;
          const mDistSq = mdx * mdx + mdy * mdy;
          if (mDistSq < 150 * 150) {
            const mDist = Math.sqrt(mDistSq);
            const mFactor = Math.cos((mDist / 150) * (Math.PI / 2));
            // Subtle natural matrix clarity without displacing dots into a ring
            radius += mFactor * 0.9;
            alpha += mFactor * 0.15;
          }

          if (radius <= 0.3) continue;

          ctx.beginPath();
          ctx.arc(drawX, drawY, Math.max(0.6, radius), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.95, Math.max(0.18, alpha))})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div className={`pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#f6f5f1] ${className}`} aria-hidden="true">
      {/* Subtle atmospheric ambient glow behind the dots */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background: 'radial-gradient(circle 900px at 15% 15%, rgba(255, 128, 0, 0.08) 0%, transparent 70%), radial-gradient(circle 1000px at 85% 85%, rgba(32, 97, 255, 0.08) 0%, transparent 70%)',
        }}
      />

      {/* Dynamic Halftone Dot Matrix Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
};
