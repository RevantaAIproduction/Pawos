'use client';

import React, { useEffect, useRef, useState } from 'react';

const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    v_uv.y = 1.0 - v_uv.y;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;
  
  varying vec2 v_uv;
  
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_pointer;
  uniform float u_velocity; // Smoothed pointer velocity
  uniform float u_glow;
  uniform vec2 u_click_pos;
  uniform float u_click_time;
  
  // Extremely soft, diffuse fbm (fractional brownian motion)
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  
  float noise(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f); // Smoothstep
    float a = hash(p + vec2(0.0, 0.0));
    float b = hash(p + vec2(1.0, 0.0));
    float c = hash(p + vec2(0.0, 1.0));
    float d = hash(p + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  
  float fbm(vec2 x) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    // Rotate to reduce axial bias
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; ++i) {
      v += a * noise(x);
      x = rot * x * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 st = uv * aspect;
    
    // Smooth pointer displacement
    vec2 pointer = u_pointer * aspect;
    vec2 diff = st - pointer;
    float dist = length(diff);
    
    // Ripple (subtle atmosphere wave)
    float ripple = 0.0;
    if (u_click_time > 0.0) {
      vec2 clickDiff = st - (u_click_pos * aspect);
      float clickDist = length(clickDiff);
      float wave = sin(clickDist * 15.0 - u_click_time * 4.0);
      float damp = exp(-clickDist * 2.5 - u_click_time * 2.0);
      ripple = wave * damp * 0.02; // Very subtle
      st += clickDiff * ripple;
    }
    
    // Pointer pull combined with velocity displacement
    float pull = exp(-dist * 1.5) * (0.05 + u_velocity * 0.1);
    st -= diff * pull;
    
    // Atmospheric procedural light
    float t = u_time * 0.8;
    vec2 q = vec2(0.);
    q.x = fbm(st + 0.1 * t);
    q.y = fbm(st + vec2(1.0) + 0.15 * t);
    
    vec2 r = vec2(0.);
    r.x = fbm(st + 1.0 * q + vec2(1.7, 9.2) + 0.2 * t);
    r.y = fbm(st + 1.0 * q + vec2(8.3, 2.8) + 0.25 * t);
    
    float f = fbm(st + r);
    
    // Colors inspired by premium light fields - made more vibrant and fluid
    vec3 color1 = vec3(0.02, 0.04, 0.12); // Deep space blue
    vec3 color2 = vec3(0.15, 0.35, 0.75); // Vibrant blue
    vec3 color3 = vec3(0.45, 0.25, 0.65); // Violet
    vec3 color4 = vec3(0.65, 0.5, 0.85);  // Lavender
    vec3 whiteLight = vec3(0.9, 0.95, 1.0);
    
    vec3 col = mix(color1, color2, clamp((f*f)*4.0, 0.0, 1.0));
    col = mix(col, color3, clamp(length(q), 0.0, 1.0));
    col = mix(col, color4, clamp(length(r.x), 0.0, 1.0));
    
    // Proximity bloom around center PawOS mark
    vec2 center = vec2(0.5) * aspect;
    float centerDist = length(st - center);
    float glowMask = exp(-centerDist * (2.0 - u_glow * 0.5));
    
    // Center atmosphere brightening
    col += whiteLight * glowMask * (0.2 + u_glow * 0.2);
    
    // Very soft overall vignette
    float vignette = length(uv - 0.5);
    col *= 1.0 - vignette * 0.5;
    
    gl_FragColor = vec4(col, 1.0);
  }
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[WebGL] Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function HeroAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webGLFailed, setWebGLFailed] = useState(false);
  
  const state = useRef({
    time: 0,
    pointerX: 0.5,
    pointerY: 0.5,
    targetPointerX: 0.5,
    targetPointerY: 0.5,
    lastTargetX: 0.5,
    lastTargetY: 0.5,
    velocity: 0,
    glow: 0,
    targetGlow: 0,
    clickTime: 0,
    clickX: 0.5,
    clickY: 0.5,
    reducedMotion: false,
    isVisible: true
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Attempt WebGL init with graceful degradation
    const gl = canvas.getContext('webgl', { alpha: false, depth: false, antialias: true }) 
            || canvas.getContext('experimental-webgl', { alpha: false, depth: false, antialias: true }) as WebGLRenderingContext | null;
            
    if (!gl) {
      setWebGLFailed(true);
      return;
    }

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    state.current.reducedMotion = mql.matches;
    const mqlListener = (e: MediaQueryListEvent) => { state.current.reducedMotion = e.matches; };
    mql.addEventListener('change', mqlListener);

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertexShader || !fragmentShader) {
      setWebGLFailed(true);
      return;
    }
    
    const program = gl.createProgram();
    if (!program) {
      setWebGLFailed(true);
      return;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[WebGL] Link error:', gl.getProgramInfoLog(program));
      setWebGLFailed(true);
      return;
    }
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]),
      gl.STATIC_DRAW
    );
    
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const pointerLoc = gl.getUniformLocation(program, 'u_pointer');
    const velLoc = gl.getUniformLocation(program, 'u_velocity');
    const glowLoc = gl.getUniformLocation(program, 'u_glow');
    const clickPosLoc = gl.getUniformLocation(program, 'u_click_pos');
    const clickTimeLoc = gl.getUniformLocation(program, 'u_click_time');

    let animationId: number;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1); // Cap dt to prevent huge jumps
      lastTime = now;

      if (state.current.isVisible) {
        // Handle DPI safely. Cap at 2.0 to prevent mobile GPU overload
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const displayWidth = Math.floor(canvas.clientWidth * dpr);
        const displayHeight = Math.floor(canvas.clientHeight * dpr);
        
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform2f(resLoc, canvas.width, canvas.height);
        }

        const s = state.current;
        
        if (!s.reducedMotion) {
          s.time += dt;
          
          // Pointer velocity tracking
          const dx = s.targetPointerX - s.lastTargetX;
          const dy = s.targetPointerY - s.lastTargetY;
          const currentVel = Math.sqrt(dx*dx + dy*dy) / dt;
          s.velocity += (Math.min(currentVel * 0.1, 1.0) - s.velocity) * (dt * 5.0);
          
          s.lastTargetX = s.targetPointerX;
          s.lastTargetY = s.targetPointerY;
          
          // Interpolate pointer location
          s.pointerX += (s.targetPointerX - s.pointerX) * (dt * 4.0);
          s.pointerY += (s.targetPointerY - s.pointerY) * (dt * 4.0);
          
          // Subtle glow expansion near center
          const distToCenter = Math.sqrt(Math.pow(s.targetPointerX - 0.5, 2) + Math.pow(s.targetPointerY - 0.5, 2));
          s.targetGlow = Math.max(0, 1.0 - distToCenter * 2.5);
          s.glow += (s.targetGlow - s.glow) * (dt * 3.0);
          
          if (s.clickTime > 0) {
            s.clickTime += dt;
            if (s.clickTime > 2.5) s.clickTime = 0;
          }
        } else {
          // Reduced motion: skip pointer interactions entirely
          s.time += dt * 0.1;
          s.pointerX = 0.5;
          s.pointerY = 0.5;
          s.velocity = 0;
          s.glow = 0;
          s.clickTime = 0;
        }

        gl.uniform1f(timeLoc, s.time);
        gl.uniform2f(pointerLoc, s.pointerX, s.pointerY);
        gl.uniform1f(velLoc, s.velocity);
        gl.uniform1f(glowLoc, s.glow);
        gl.uniform2f(clickPosLoc, s.clickX, s.clickY);
        gl.uniform1f(clickTimeLoc, s.clickTime);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      animationId = requestAnimationFrame(render);
    };
    
    animationId = requestAnimationFrame(render);

    const updatePointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      state.current.targetPointerX = (clientX - rect.left) / rect.width;
      state.current.targetPointerY = 1.0 - ((clientY - rect.top) / rect.height);
    };

    const handlePointerMove = (e: PointerEvent) => {
      updatePointer(e.clientX, e.clientY);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (state.current.reducedMotion) return;
      updatePointer(e.clientX, e.clientY);
      state.current.clickX = state.current.targetPointerX;
      state.current.clickY = state.current.targetPointerY;
      state.current.clickTime = 0.01;
    };

    const handlePointerLeave = () => {
      state.current.targetPointerX = 0.5;
      state.current.targetPointerY = 0.5;
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(animationId);
    };
    const handleContextRestored = () => {
      // For simplicity, trigger a fallback if context lost to avoid deep re-init logic
      setWebGLFailed(true);
    };

    // Pause only when significantly out of view
    const observer = new IntersectionObserver(([entry]) => {
      state.current.isVisible = entry.isIntersecting;
    }, { rootMargin: '100px' });
    observer.observe(canvas);

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    document.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
      mql.removeEventListener('change', mqlListener);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      
      if (gl) {
        gl.deleteBuffer(positionBuffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
      }
    };
  }, []);

  if (webGLFailed) {
    // Graceful CSS Fallback
    return (
      <div 
        className="absolute inset-0 h-full w-full -z-10 opacity-70"
        style={{
          background: 'radial-gradient(100% 100% at 50% 0%, rgba(20,40,90,1) 0%, rgba(10,20,45,1) 100%)'
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(140,120,200,0.15),transparent_60%)]" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full object-cover -z-10"
      style={{ touchAction: 'auto' }} // Allow scrolling natively
    />
  );
}
