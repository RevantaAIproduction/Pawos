"use client";

import { useEffect, useRef, useState } from "react";

const NODES = [
  { id: "pawos", label: "PAWOS", x: 0, y: 0, isCenter: true },
  { id: "files", label: "Files", x: -120, y: -80 },
  { id: "projects", label: "Projects", x: 0, y: -140 },
  { id: "code", label: "Code", x: 120, y: -80 },
  { id: "terminal", label: "Terminal", x: -160, y: 0 },
  { id: "git", label: "Git", x: 160, y: 0 },
  { id: "github", label: "GitHub", x: -120, y: 80 },
  { id: "jira", label: "Jira", x: 0, y: 140 },
  { id: "linear", label: "Linear", x: 120, y: 80 },
  { id: "slack", label: "Slack", x: -80, y: 180 },
  { id: "browser", label: "Browser", x: 80, y: 180 },
];

export function ConnectionsGraphic() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      setMousePos({ x, y });
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("pointermove", handlePointerMove);
      container.addEventListener("pointerenter", () => setIsHovering(true));
      container.addEventListener("pointerleave", () => {
        setIsHovering(false);
        setMousePos({ x: 0, y: 0 });
      });
    }

    return () => {
      if (container) {
        container.removeEventListener("pointermove", handlePointerMove);
        container.removeEventListener("pointerenter", () => setIsHovering(true));
        container.removeEventListener("pointerleave", () => setIsHovering(false));
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-[500px] flex items-center justify-center overflow-hidden touch-none"
    >
      {/* Draw connections */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
        <g transform="translate(50%, 50%)">
          {NODES.filter(n => !n.isCenter).map(node => {
            // Calculate dynamic curve based on mouse position
            const influence = isHovering ? 0.05 : 0;
            const dx = node.x - mousePos.x * influence;
            const dy = node.y - mousePos.y * influence;
            
            return (
              <line
                key={`line-${node.id}`}
                x1="0"
                y1="0"
                x2={dx}
                y2={dy}
                stroke="currentColor"
                strokeWidth="1"
                className="text-indigo-400/30 transition-all duration-700 ease-out"
              />
            );
          })}
        </g>
      </svg>

      {/* Draw nodes */}
      <div className="absolute inset-0 flex items-center justify-center">
        {NODES.map(node => {
          const influence = isHovering && !node.isCenter ? 0.08 : 0;
          const translateX = node.x - mousePos.x * influence;
          const translateY = node.y - mousePos.y * influence;
          
          const isCenter = node.isCenter;

          return (
            <div
              key={node.id}
              className={`absolute transition-all duration-700 ease-out flex items-center justify-center rounded-full
                ${isCenter ? 'w-24 h-24 bg-white text-black font-bold text-lg shadow-[0_0_40px_rgba(255,255,255,0.2)] z-20' 
                          : 'w-20 h-20 bg-neutral-900 border border-neutral-700 text-neutral-300 text-xs font-medium z-10 backdrop-blur-md hover:border-indigo-500 hover:text-white hover:scale-110 shadow-xl'}
              `}
              style={{
                transform: `translate(${translateX}px, ${translateY}px)`
              }}
            >
              {node.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
