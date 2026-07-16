import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Interaction, Medicine } from '../types';

interface InteractionGraphProps {
  medicines: Medicine[];
  interactions: Interaction[];
}

interface NodePoint {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface TooltipState {
  interaction: Interaction;
  x: number;
  y: number;
}

const SEVERITY_COLOR: Record<string, { edge: string; glow: string; badge: string; text: string }> = {
  Critical: { edge: '#ef4444', glow: '#fca5a5', badge: 'bg-red-100 text-red-700 border-red-200', text: 'text-red-700' },
  High:     { edge: '#f97316', glow: '#fdba74', badge: 'bg-orange-100 text-orange-700 border-orange-200', text: 'text-orange-700' },
  Medium:   { edge: '#f59e0b', glow: '#fcd34d', badge: 'bg-amber-100 text-amber-700 border-amber-200', text: 'text-amber-700' },
  Low:      { edge: '#3b82f6', glow: '#93c5fd', badge: 'bg-blue-100 text-blue-700 border-blue-200', text: 'text-blue-700' },
};

const W = 340;
const H = 280;
const PADDING = 48;
const DAMPING = 0.82;
const REPULSION = 1800;
const ATTRACTION = 0.012;
const SAFE_LINK_COLOR = '#6ee7b7';
const SAFE_LINK_GLOW = '#34d399';

function truncateLine(line: string, max: number) {
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

// Wraps a medicine name into 1-2 lines that fit inside the node circle,
// auto-scaling font size down as the name gets longer.
function wrapNodeLabel(name: string): { lines: string[]; fontSize: number } {
  const clean = name.trim();

  if (clean.length <= 8) {
    return { lines: [clean], fontSize: 10 };
  }

  const words = clean.split(/\s+/);

  if (words.length > 1) {
    // Find the word-split point that balances the two lines best
    let bestSplit = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ').length;
      const l2 = words.slice(i).join(' ').length;
      const diff = Math.abs(l1 - l2);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSplit = i;
      }
    }
    const line1 = words.slice(0, bestSplit).join(' ');
    const line2 = words.slice(bestSplit).join(' ');
    const maxLen = Math.max(line1.length, line2.length);
    const fontSize = maxLen <= 8 ? 9 : maxLen <= 11 ? 8 : 7;
    return { lines: [truncateLine(line1, 12), truncateLine(line2, 12)], fontSize };
  }

  // Single long word - split roughly in half
  if (clean.length <= 14) {
    const mid = Math.ceil(clean.length / 2);
    return {
      lines: [clean.slice(0, mid), clean.slice(mid)],
      fontSize: clean.length <= 11 ? 8 : 7,
    };
  }

  // Very long single word - truncate second line
  return { lines: [clean.slice(0, 6), truncateLine(clean.slice(6), 6)], fontSize: 7 };
}

// Slightly grow the node radius for names that need wrapping
function radiusForName(name: string): number {
  const { lines } = wrapNodeLabel(name);
  const maxLineLen = Math.max(...lines.map((l) => l.length));
  return Math.min(34, Math.max(28, 20 + maxLineLen * 1.1));
}

export default function InteractionGraph({ medicines, interactions }: InteractionGraphProps) {
  const [nodes, setNodes] = useState<NodePoint[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [pulse, setPulse] = useState(0);
  const [safeAnimFrame, setSafeAnimFrame] = useState(0);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const isSafe = interactions.length === 0;

  // Initialize nodes in a circle
  useEffect(() => {
    if (medicines.length === 0) return;
    const total = medicines.length;
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) / 2 - PADDING - 10;
    const initial: NodePoint[] = medicines.map((m, i) => {
      const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
      return {
        id: m.name,
        name: m.name,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: radiusForName(m.name),
      };
    });
    setNodes(initial);
  }, [medicines]);

  // Physics loop
  useEffect(() => {
    if (nodes.length === 0) return;

    const tick = () => {
      frameRef.current += 1;
      if (frameRef.current % 2 === 0) setPulse((p) => p + 1);
      if (frameRef.current % 3 === 0) setSafeAnimFrame((p) => p + 1);

      setNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));

        // Repulsion
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = REPULSION / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            next[i].vx -= fx;
            next[i].vy -= fy;
            next[j].vx += fx;
            next[j].vy += fy;
          }
        }

        // Attraction to center
        for (const n of next) {
          n.vx += (W / 2 - n.x) * ATTRACTION;
          n.vy += (H / 2 - n.y) * ATTRACTION;
        }

        // Integrate + damp + clamp
        for (const n of next) {
          n.vx *= DAMPING;
          n.vy *= DAMPING;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(n.radius + 4, Math.min(W - n.radius - 4, n.x));
          n.y = Math.max(n.radius + 4, Math.min(H - n.radius - 4, n.y));
        }

        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [nodes.length]);

  const nodeMap = useMemo(() => {
    const m: Record<string, NodePoint> = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  const handleNodeClick = useCallback((name: string) => {
    setSelected((s) => (s === name ? null : name));
    setTooltip(null);
  }, []);

  const handleEdgeClick = useCallback(
    (interaction: Interaction, e: ReactMouseEvent<SVGLineElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      setTooltip((prev) =>
        prev?.interaction === interaction
          ? null
          : {
              interaction,
              x: (e.clientX - rect.left) * scaleX,
              y: (e.clientY - rect.top) * scaleY,
            },
      );
    },
    [],
  );

  const handleDrag = useCallback((name: string, e: ReactMouseEvent<SVGCircleElement>) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;

    const onMove = (me: MouseEvent) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === name
            ? { ...n, x: (me.clientX - rect.left) * scaleX, y: (me.clientY - rect.top) * scaleY, vx: 0, vy: 0 }
            : n,
        ),
      );
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // Animated safe "breathing" offset
  const safeOffset = Math.sin(safeAnimFrame * 0.06) * 3;

  if (medicines.length === 0) {
    return (
      <div className="rounded-3xl border border-white/80 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">
        No medicines available for interaction graphing.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-100 bg-white/90 p-5 shadow-md backdrop-blur-sm">
      {/* Header */}
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Interaction Graph</div>
        <div className="mt-1 text-sm text-slate-500">
          {isSafe ? 'Drag nodes to explore · All medicines are safe together' : 'Drag nodes or tap an edge to see interaction details'}
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* SVG Canvas */}
        <div className="relative w-full max-w-[360px]">
          {/* Safe badge overlay */}
          {isSafe && (
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-end justify-end p-3"
              style={{ transform: `translateY(${safeOffset}px)`, transition: 'transform 0.1s linear' }}
            >
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
                    fill="#10b981"
                    opacity="0.2"
                  />
                  <path
                    d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path d="M9 12l2 2 4-4" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[11px] font-bold text-emerald-700">100% Safe</span>
              </div>
            </div>
          )}

          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #f8faff 0%, #eef3ff 100%)', minHeight: 220 }}
            onClick={() => { setTooltip(null); }}
          >
            <defs>
              {/* Glow filters */}
              <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-node" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>

              {/* Node gradient */}
              <radialGradient id="node-grad-active" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4338ca" />
              </radialGradient>
              <radialGradient id="node-grad-inactive" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#64748b" />
              </radialGradient>
              <radialGradient id="node-grad-selected" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </radialGradient>

              {/* Pulse animation for interaction edges */}
              <style>{`
                @keyframes dashPulse {
                  from { stroke-dashoffset: 24; }
                  to { stroke-dashoffset: 0; }
                }
                @keyframes safePulse {
                  0%, 100% { stroke-opacity: 0.35; }
                  50% { stroke-opacity: 0.75; }
                }
                .edge-pulse { animation: dashPulse 0.8s linear infinite; }
                .safe-pulse { animation: safePulse 2.2s ease-in-out infinite; }
              `}</style>
            </defs>

            {/* Safe mode: soft green connecting lines between all nodes */}
            {isSafe && nodes.length > 1 &&
              nodes.map((a, i) =>
                nodes.slice(i + 1).map((b) => (
                  <line
                    key={`safe-${a.id}-${b.id}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={SAFE_LINK_COLOR}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    filter="url(#glow-green)"
                    className="safe-pulse"
                  />
                )),
              )
            }

            {/* Interaction edges */}
            {!isSafe && interactions.map((intr, idx) => {
              const src = nodeMap[intr.drugs[0]];
              const tgt = nodeMap[intr.drugs[1]];
              if (!src || !tgt) return null;
              const colors = SEVERITY_COLOR[intr.severity] ?? SEVERITY_COLOR.Low;
              const isActive = !selected || intr.drugs.includes(selected);
              const isTooltipTarget = tooltip?.interaction === intr;

              return (
                <g key={`edge-${idx}`}>
                  {/* Glow layer */}
                  <line
                    x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                    stroke={colors.glow}
                    strokeWidth={isTooltipTarget ? 14 : 8}
                    strokeOpacity={isActive ? 0.35 : 0.08}
                    strokeLinecap="round"
                    filter="url(#glow-red)"
                  />
                  {/* Animated dashed line */}
                  <line
                    x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                    stroke={colors.edge}
                    strokeWidth={isActive ? 3.5 : 1.5}
                    strokeOpacity={isActive ? 1 : 0.2}
                    strokeLinecap="round"
                    strokeDasharray="8 4"
                    className={isActive ? 'edge-pulse' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); handleEdgeClick(intr, e); }}
                  />
                  {/* Invisible fat hit area */}
                  <line
                    x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                    stroke="transparent"
                    strokeWidth={20}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); handleEdgeClick(intr, e); }}
                  />
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const isSelected = selected === node.id;
              const isDimmed = selected !== null && !isSelected && !interactions.some((i) => i.drugs.includes(selected) && i.drugs.includes(node.id));
              const grad = isSelected ? 'url(#node-grad-selected)' : isDimmed ? 'url(#node-grad-inactive)' : 'url(#node-grad-active)';
              const { lines, fontSize } = wrapNodeLabel(node.name);
              const lineHeight = fontSize * 1.15;
              const startY = node.y - ((lines.length - 1) * lineHeight) / 2;

              return (
                <g
                  key={node.id}
                  style={{ cursor: 'grab' }}
                  onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
                  onMouseDown={(e) => handleDrag(node.id, e as unknown as ReactMouseEvent<SVGCircleElement>)}
                >
                  {/* Outer glow ring for selected */}
                  {isSelected && (
                    <circle
                      cx={node.x} cy={node.y} r={node.radius + 8}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth={2}
                      strokeOpacity={0.5}
                      filter="url(#glow-node)"
                    />
                  )}
                  {/* Safe glow ring (idle) */}
                  {isSafe && !isSelected && (
                    <circle
                      cx={node.x} cy={node.y} r={node.radius + 5}
                      fill="none"
                      stroke={SAFE_LINK_GLOW}
                      strokeWidth={1.5}
                      strokeOpacity={0.3}
                    />
                  )}
                  {/* Main circle */}
                  <circle
                    cx={node.x} cy={node.y}
                    r={node.radius}
                    fill={grad}
                    opacity={isDimmed ? 0.45 : 1}
                    style={{ filter: isDimmed ? 'none' : 'drop-shadow(0 4px 12px rgba(67,56,202,0.35))' }}
                  />
                  {/* Glass shine */}
                  <ellipse
                    cx={node.x - node.radius * 0.2}
                    cy={node.y - node.radius * 0.3}
                    rx={node.radius * 0.45}
                    ry={node.radius * 0.22}
                    fill="white"
                    fillOpacity={0.22}
                  />
                  {/* Label (wrapped, auto-sized) */}
                  <text
                    x={node.x}
                    textAnchor="middle"
                    fill="white"
                    fontSize={fontSize}
                    fontWeight="700"
                    letterSpacing="0.01em"
                    opacity={isDimmed ? 0.5 : 1}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {lines.map((line, i) => (
                      <tspan key={i} x={node.x} y={startY + i * lineHeight} dominantBaseline="middle">
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}

            {/* Edge click tooltip (inline SVG) */}
            {tooltip && (() => {
              const tx = Math.min(tooltip.x, W - 130);
              const ty = tooltip.y < H / 2 ? tooltip.y + 16 : tooltip.y - 80;
              const colors = SEVERITY_COLOR[tooltip.interaction.severity] ?? SEVERITY_COLOR.Low;
              return (
                <g>
                  <rect x={tx - 8} y={ty - 8} width={148} height={72} rx={10} ry={10}
                    fill="white" stroke={colors.edge} strokeWidth={1.5}
                    style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.12))' }}
                  />
                  <text x={tx} y={ty + 7} fontSize="9" fontWeight="700" fill={colors.edge}>
                    {tooltip.interaction.severity} · {tooltip.interaction.drugs.join(' + ')}
                  </text>
                  {wrapText(tooltip.interaction.description, 24).slice(0, 4).map((line, i) => (
                    <text key={i} x={tx} y={ty + 22 + i * 12} fontSize="8.5" fill="#475569">{line}</text>
                  ))}
                </g>
              );
            })()}
          </svg>
        </div>

        {/* Right panel */}
        <div className="flex-1 space-y-3">
          {/* SAFE STATE */}
          {isSafe && (
            <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
              <div className="flex items-center gap-3">
                {/* Shield icon */}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
                      fill="#10b981" fillOpacity="0.25" />
                    <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
                      stroke="#059669" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M9 12l2 2 4-4" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-bold text-emerald-800">100% Safe Combination</div>
                  <div className="mt-0.5 text-xs text-emerald-600">
                    No known interactions found among the {medicines.length} medicine{medicines.length !== 1 ? 's' : ''} in this prescription.
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {medicines.map((m) => (
                  <div key={m.name} className="rounded-xl border border-emerald-100 bg-white/70 px-2 py-1.5 text-center">
                    <div className="truncate text-[10px] font-semibold text-slate-700">{m.name}</div>
                    <div className="mt-0.5 text-[9px] text-emerald-600">✓ Clear</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INTERACTION CARDS */}
          {!isSafe && interactions.map((intr, idx) => {
            const colors = SEVERITY_COLOR[intr.severity] ?? SEVERITY_COLOR.Low;
            const isActive = !selected || intr.drugs.includes(selected);
            const isTooltipTarget = tooltip?.interaction === intr;

            return (
              <div
                key={idx}
                className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                  isTooltipTarget
                    ? 'border-slate-300 bg-slate-50 shadow-md'
                    : isActive
                    ? 'border-slate-200 bg-white shadow-sm hover:shadow-md'
                    : 'border-slate-100 bg-white/50 opacity-40'
                }`}
                onClick={() =>
                  setTooltip((prev) =>
                    prev?.interaction === intr ? null : { interaction: intr, x: 0, y: 0 },
                  )
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">{intr.drugs.join(' + ')}</div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${colors.badge}`}>
                    {intr.severity}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{intr.description}</p>
              </div>
            );
          })}

          {/* Selected node info */}
          {selected && !isSafe && (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
              <div className="text-xs font-semibold text-indigo-700">
                Showing edges for <span className="font-bold">{selected}</span>
              </div>
              <button
                className="mt-1 text-[11px] text-indigo-400 underline underline-offset-2"
                onClick={() => setSelected(null)}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Naive word-wrap for SVG tooltips
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}
