'use client';

import React, { useEffect, useRef } from 'react';

const STAGES = [
  { id: 'request', title: 'REQUEST', text: 'Fix the authentication issue.', sub: 'Incoming task' },
  { id: 'workspace', title: 'WORKSPACE', text: 'Read the project. Inspect the relevant files.', sub: 'Files & Code' },
  { id: 'execution', title: 'EXECUTION', text: 'Change the code. Run the environment.', sub: 'Terminal' },
  { id: 'verification', title: 'VERIFICATION', text: 'Verify the result. Commit to Git.', sub: 'Version Control' },
  { id: 'reporting', title: 'REPORTING', text: 'Update the ticket. Report what changed.', sub: 'Jira / Linear' },
];

export function ConnectionsWorkflow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let isActive = false;
    let rafId: number;
    
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isReduced = mql.matches;

    const update = () => {
      if (isReduced) return;
      
      currentX += (targetX - currentX) * 0.1;
      currentY += (targetY - currentY) * 0.1;
      
      cardsRef.current.forEach((card, index) => {
        if (!card) return;
        
        if (!isActive) {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0) scale(1)';
          card.style.borderColor = 'rgba(64, 64, 64, 0.4)';
          card.style.boxShadow = '0 10px 30px -10px rgba(0,0,0,0.5)';
          card.style.zIndex = '1';
          return;
        }
        
        const rect = card.getBoundingClientRect();
        const cardCenterX = rect.left + rect.width / 2;
        const cardCenterY = rect.top + rect.height / 2;
        
        const dx = currentX - cardCenterX;
        const dy = currentY - cardCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Interaction radius (how far the cursor influence reaches)
        const maxDist = 350;
        const influence = Math.max(0, 1 - dist / maxDist);
        const smoothInfluence = influence * influence * (3 - 2 * influence); // Smoothstep
        
        // Apply responsive visual changes directly via DOM to avoid React re-renders
        const opacity = 0.3 + (smoothInfluence * 0.7); // Fades distant cards to 30%
        const yOffset = smoothInfluence * -15; // Lift up to 15px
        const scale = 1 + smoothInfluence * 0.05;
        const borderAlpha = 0.2 + smoothInfluence * 0.6;
        
        card.style.opacity = opacity.toFixed(3);
        card.style.transform = `translateY(${yOffset}px) scale(${scale.toFixed(3)})`;
        card.style.borderColor = `rgba(99, 102, 241, ${borderAlpha})`;
        card.style.boxShadow = `0 ${20 + 20 * smoothInfluence}px ${40 * smoothInfluence}px -10px rgba(99, 102, 241, ${0.15 * smoothInfluence}), 0 10px 30px -10px rgba(0,0,0,0.8)`;
        card.style.zIndex = smoothInfluence > 0.1 ? '10' : '1';
      });
      
      rafId = requestAnimationFrame(update);
    };
    
    if (!isReduced) rafId = requestAnimationFrame(update);
    
    const handlePointerMove = (e: PointerEvent) => {
      isActive = true;
      targetX = e.clientX;
      targetY = e.clientY;
    };
    
    const handlePointerLeave = () => {
      isActive = false;
    };
    
    container.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    
    return () => {
      cancelAnimationFrame(rafId);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative py-20 px-4 w-full touch-pan-y group">
      {/* Background connecting thread (Execution Path) */}
      <div className="absolute top-1/2 left-[5%] w-[90%] h-[2px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent -translate-y-1/2 hidden md:block" />
      <div className="absolute left-1/2 top-[5%] h-[90%] w-[2px] bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent -translate-x-1/2 md:hidden" />
      
      {/* Overlapping Workflow Surfaces */}
      <div className="relative z-10 flex flex-col md:flex-row items-stretch justify-center gap-4 md:gap-0 md:-space-x-6 max-w-6xl mx-auto">
        {STAGES.map((stage, i) => (
          <div
            key={stage.id}
            ref={(el) => { cardsRef.current[i] = el; }}
            className="w-full md:w-1/5 min-h-[220px] bg-neutral-950/90 backdrop-blur-2xl border border-neutral-800/40 rounded-2xl p-6 flex flex-col justify-between transition-all duration-[400ms] ease-out will-change-transform shadow-2xl origin-center"
          >
            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-indigo-400/80 mb-4 uppercase">
                {stage.title}
              </div>
              <div className="text-base text-neutral-200 font-medium leading-relaxed">
                {stage.text}
              </div>
            </div>
            
            <div className="mt-8 pt-4 border-t border-neutral-800/50 flex items-center justify-between">
              <span className="text-xs font-mono text-neutral-500">0{i + 1}</span>
              <span className="text-xs text-neutral-400">{stage.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
