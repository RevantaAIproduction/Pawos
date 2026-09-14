'use client';

import React, { useEffect, useRef } from 'react';

type Particle = {
  ox: number;
  oy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number; // facing x
  fy: number; // facing y
  opacity: number;
};

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];
    
    // State
    const SPACING = 25;
    const INTERACTION_RADIUS = 70;
    const pointer = { x: -1000, y: -1000, vx: 0, vy: 0, isActive: false };
    const lastPointer = { x: -1000, y: -1000 };
    
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = mql.matches;
    const mqlListener = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    mql.addEventListener('change', mqlListener);

    const initParticles = (width: number, height: number) => {
      particles = [];
      const cols = Math.ceil(width / SPACING) + 2;
      const rows = Math.ceil(height / SPACING) + 2;
      
      const offsetX = (width - (cols - 1) * SPACING) / 2;
      const offsetY = (height - (rows - 1) * SPACING) / 2;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = offsetX + i * SPACING;
          const y = offsetY + j * SPACING;
          particles.push({
            ox: x, oy: y,
            x: x, y: y,
            vx: 0, vy: 0,
            fx: 1, fy: 0,
            opacity: 0
          });
        }
      }
    };

    const resize = () => {
      if (!canvas || !containerRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = containerRef.current.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      initParticles(rect.width, rect.height);
    };

    window.addEventListener('resize', resize);
    resize();

    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Update pointer velocity
      pointer.vx = (pointer.x - lastPointer.x) / (dt * 1000 || 1);
      pointer.vy = (pointer.y - lastPointer.y) / (dt * 1000 || 1);
      lastPointer.x = pointer.x;
      lastPointer.y = pointer.y;

      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Base ambient flow even when pointer is idle
      const time = now * 0.0005;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!reducedMotion) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (pointer.isActive && dist < INTERACTION_RADIUS) {
            const force = 1 - Math.pow(dist / INTERACTION_RADIUS, 1.5);
            
            // Drag effect (follows pointer)
            p.vx += pointer.vx * force * 0.08;
            p.vy += pointer.vy * force * 0.08;
            
            // Subtle repulsion to bend around pointer
            p.vx -= (dx / dist) * force * 0.8;
            p.vy -= (dy / dist) * force * 0.8;
            
            p.opacity = Math.min(p.opacity + force * 0.25, 1);
          }

          // Ambient noise (very subtle drift)
          p.vx += Math.sin(p.ox * 0.01 + time) * 0.02;
          p.vy += Math.cos(p.oy * 0.01 + time) * 0.02;

          // Spring back
          p.vx += (p.ox - p.x) * 0.05;
          p.vy += (p.oy - p.y) * 0.05;

          // Friction
          p.vx *= 0.82;
          p.vy *= 0.82;

          p.x += p.vx;
          p.y += p.vy;

          // Update facing direction
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (speed > 0.1) {
            const tx = p.vx / speed;
            const ty = p.vy / speed;
            p.fx += (tx - p.fx) * 0.3;
            p.fy += (ty - p.fy) * 0.3;
            const flen = Math.sqrt(p.fx * p.fx + p.fy * p.fy);
            p.fx /= flen;
            p.fy /= flen;
          } else {
            // Slowly return to horizontal if calm
            p.fx += (1 - p.fx) * 0.05;
            p.fy += (0 - p.fy) * 0.05;
            const flen = Math.sqrt(p.fx * p.fx + p.fy * p.fy);
            p.fx /= flen;
            p.fy /= flen;
          }

          p.opacity *= 0.85; // fast decay for snake tail
        }

        // Render
        const drawOpacity = reducedMotion ? 0 : p.opacity;
        
        if (drawOpacity > 0.01) {
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.fy, p.fx));
          ctx.globalAlpha = drawOpacity;
          
          // Dynamic color shifting based on activation
          if (p.opacity > 0.4) {
            ctx.strokeStyle = '#e0e7ff'; // Bright white/blue when active
            ctx.fillStyle = '#e0e7ff';
          } else {
            ctx.strokeStyle = '#6366f1'; // Muted indigo otherwise
            ctx.fillStyle = '#6366f1';
          }

          ctx.lineWidth = 1.0;

          if (speed > 1.2 && !reducedMotion) {
            // Active: Chevron
            ctx.beginPath();
            ctx.moveTo(-3, -3);
            ctx.lineTo(2, 0);
            ctx.lineTo(-3, 3);
            ctx.stroke();
          } else if (speed > 0.3 && !reducedMotion) {
            // Semi-active: Dash
            ctx.beginPath();
            ctx.moveTo(-3, 0);
            ctx.lineTo(3, 0);
            ctx.stroke();
          } else {
            // Idle: Dot
            ctx.beginPath();
            ctx.arc(0, 0, 1.0, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
      }

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    const updatePointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.isActive = true;
    };

    const handlePointerMove = (e: PointerEvent) => updatePointer(e);
    const handlePointerDown = (e: PointerEvent) => updatePointer(e);
    const handlePointerLeave = () => {
      pointer.isActive = false;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerleave', handlePointerLeave);
      mql.removeEventListener('change', mqlListener);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 h-full w-full z-0 overflow-hidden pointer-events-none"
      style={{
        background: 'transparent'
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block pointer-events-none"
      />
    </div>
  );
}

