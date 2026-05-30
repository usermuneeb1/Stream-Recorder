import { useEffect, useRef, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────
interface ParticleFieldProps {
  /** Number of particles to render */
  count?: number;
  /** Particle color as any valid CSS color string */
  color?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
}

// ─── Constants ──────────────────────────────────────────────────────
const CONNECTION_DISTANCE = 120;
const BASE_SPEED = 0.3;

/**
 * ParticleField — Lightweight canvas-based floating particle system.
 *
 * Renders softly glowing dots that drift randomly across the viewport.
 * When two particles come within 120px of each other, a faint
 * connecting line is drawn between them (constellation effect).
 *
 * Automatically pauses animation when the browser tab is hidden
 * to conserve resources.
 */
export const ParticleField: React.FC<ParticleFieldProps> = ({
  count = 25,
  color = 'rgba(239,68,68,0.3)',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>(0);
  const isVisibleRef = useRef(true);

  /** Parse the color string to extract RGB values for line drawing */
  const parseColor = useCallback((cssColor: string): { r: number; g: number; b: number } => {
    // Handle rgba() format
    const rgbaMatch = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbaMatch) {
      return { r: +rgbaMatch[1], g: +rgbaMatch[2], b: +rgbaMatch[3] };
    }
    // Fallback to brand red
    return { r: 239, g: 68, b: 68 };
  }, []);

  /** Initialize particles with random positions and velocities */
  const initParticles = useCallback(
    (width: number, height: number) => {
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * BASE_SPEED,
        vy: (Math.random() - 0.5) * BASE_SPEED,
        radius: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.3,
      }));
    },
    [count]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgb = parseColor(color);

    /** Resize canvas to match container and re-init particles if needed */
    const handleResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;

      // Re-initialize if particles don't exist yet
      if (particlesRef.current.length === 0) {
        initParticles(canvas.width, canvas.height);
      }
    };

    /** Pause / resume on tab visibility change */
    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden;
      if (isVisibleRef.current) {
        animate(); // Resume the loop
      }
    };

    /** Core animation loop */
    const animate = () => {
      if (!isVisibleRef.current) return;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const particles = particlesRef.current;

      // Update positions & draw particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Draw glowing dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${p.opacity})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${p.opacity * 0.5})`;
        ctx.fill();
      }

      // Reset shadow for lines
      ctx.shadowBlur = 0;

      // Draw constellation lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DISTANCE) {
            const lineOpacity = (1 - dist / CONNECTION_DISTANCE) * 0.15;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${lineOpacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Bootstrap
    handleResize();
    animate();

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [color, count, initParticles, parseColor]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
};
