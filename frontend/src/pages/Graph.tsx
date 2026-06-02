import { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Loader2, Move, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { api } from '@/api/client';
import type { GraphNode, GraphEdge } from '@/types';

interface ViewNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  data: GraphNode;
}

const W = 1000;
const H = 700;
const CENTER_X = W / 2;
const CENTER_Y = H / 2;

export function Graph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [nodes, setNodes] = useState<ViewNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<ViewNode | null>(null);
  const [tick, setTick] = useState(0);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);

  useEffect(() => {
    api
      .get<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/graph')
      .then((data) => {
        const n = data.nodes.map((d, i) => {
          const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
          return {
            id: d.id,
            x: CENTER_X + Math.cos(angle) * 240,
            y: CENTER_Y + Math.sin(angle) * 240,
            vx: 0,
            vy: 0,
            data: d,
          };
        });
        setNodes(n);
        setEdges(data.edges);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (nodes.length === 0) return;
    const id = setInterval(() => {
      setNodes((prev) => simulate(prev, edges));
      setTick((t) => t + 1);
    }, 50);
    return () => clearInterval(id);
  }, [edges, nodes.length === 0]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    draw(ctx, nodes, edges, hovered, transform);
  }, [nodes, edges, hovered, transform, tick]);

  const stats = useMemo(() => {
    const mem = nodes.filter((n) => n.data.type === 'memory').length;
    const tags = nodes.filter((n) => n.data.type === 'tag').length;
    return { mem, tags, edges: edges.length };
  }, [nodes, edges]);

  function handleMove(e: React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    const found = nodes.find((n) => Math.hypot(n.x - x, n.y - y) < 14) ?? null;
    setHovered(found);
  }

  function handleMouseDown(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, tx: transform.x, ty: transform.y };
  }

  function handleMouseUp() {
    dragRef.current = null;
  }

  function handleMouseMoveDrag(e: React.MouseEvent) {
    if (!dragRef.current) return;
    setTransform((t) => ({
      ...t,
      x: dragRef.current!.tx + (e.clientX - dragRef.current!.startX),
      y: dragRef.current!.ty + (e.clientY - dragRef.current!.startY),
    }));
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setTransform((t) => ({
      ...t,
      scale: Math.max(0.3, Math.min(3, t.scale * (e.deltaY > 0 ? 0.9 : 1.1))),
    }));
  }

  function reset() {
    setTransform({ x: 0, y: 0, scale: 1 });
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-fg-mute">
        <Loader2 size={16} className="animate-spin" /> 加载图谱...
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardBody className="text-center py-12">
            <Brain size={32} className="mx-auto text-fg-mute mb-3" />
            <h2 className="text-lg font-semibold">还没有任何记忆节点</h2>
            <p className="text-sm text-fg-soft mt-1">开始对话或跑 Agent 任务后会自动构建图谱</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-end justify-between flex-wrap gap-2 mb-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Brain size={18} /> 知识图谱
          </h1>
          <p className="text-sm text-fg-mute mt-1">记忆节点 + 标签节点 · 拖动 / 滚轮缩放</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">记忆: {stats.mem}</Badge>
          <Badge variant="brand">标签: {stats.tags}</Badge>
          <Badge>边: {stats.edges}</Badge>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden">
        <div className="relative w-full h-full">
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', cursor: dragRef.current ? 'grabbing' : 'grab' }}
            onMouseMove={(e) => {
              handleMove(e);
              handleMouseMoveDrag(e);
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              handleMouseUp();
              setHovered(null);
            }}
            onWheel={handleWheel}
          />
          <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 bg-bg-elev/85 backdrop-blur border border-border rounded-md p-1">
            <button onClick={() => setTransform((t) => ({ ...t, scale: Math.min(3, t.scale * 1.15) }))} className="p-1.5 hover:bg-bg-soft rounded">
              <ZoomIn size={14} />
            </button>
            <button onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.3, t.scale * 0.87) }))} className="p-1.5 hover:bg-bg-soft rounded">
              <ZoomOut size={14} />
            </button>
            <button onClick={reset} className="p-1.5 hover:bg-bg-soft rounded">
              <RotateCcw size={14} />
            </button>
          </div>
          {hovered && (
            <div className="absolute top-3 left-3 max-w-xs bg-bg-elev/95 backdrop-blur border border-border rounded-md p-3 shadow-elev">
              <Badge variant={hovered.data.type === 'tag' ? 'brand' : 'info'} size="sm">
                {hovered.data.type}
              </Badge>
              <div className="text-sm mt-1.5 break-words">{hovered.data.label}</div>
              <div className="text-[10.5px] text-fg-mute mt-1 font-mono">{hovered.data.id.slice(0, 24)}...</div>
              <div className="text-[10.5px] text-fg-mute mt-0.5">权重: {hovered.data.weight}</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function simulate(nodes: ViewNode[], edges: GraphEdge[]): ViewNode[] {
  const next = nodes.map((n) => ({ ...n }));
  const centerForce = 0.01;
  const repulsion = 4000;
  const linkDist = 80;
  const linkForce = 0.05;
  const damping = 0.85;

  for (let i = 0; i < next.length; i += 1) {
    const a = next[i];
    a.vx += (CENTER_X - a.x) * centerForce;
    a.vy += (CENTER_Y - a.y) * centerForce;
    for (let j = i + 1; j < next.length; j += 1) {
      const b = next[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy + 0.01;
      const dist = Math.sqrt(distSq);
      const force = repulsion / distSq;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  const map = new Map(next.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = map.get(e.source);
    const b = map.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const force = (dist - linkDist) * linkForce * e.weight;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  for (const n of next) {
    n.vx *= damping;
    n.vy *= damping;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.max(20, Math.min(W - 20, n.x));
    n.y = Math.max(20, Math.min(H - 20, n.y));
  }

  return next;
}

function draw(
  ctx: CanvasRenderingContext2D,
  nodes: ViewNode[],
  edges: GraphEdge[],
  hovered: ViewNode | null,
  transform: { x: number; y: number; scale: number },
) {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = 'rgb(var(--bg))';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);

  const map = new Map(nodes.map((n) => [n.id, n]));

  ctx.lineWidth = 1;
  for (const e of edges) {
    const a = map.get(e.source);
    const b = map.get(e.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle =
      e.type === 'tag' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(161, 161, 170, 0.15)';
    ctx.lineWidth = e.type === 'tag' ? 1 + Math.min(2, e.weight * 0.3) : 0.8;
    ctx.stroke();
  }

  for (const n of nodes) {
    const isHovered = hovered?.id === n.id;
    if (n.data.type === 'tag') {
      ctx.beginPath();
      ctx.arc(n.x, n.y, isHovered ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'rgb(99, 102, 241)' : 'rgba(99, 102, 241, 0.7)';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(n.x, n.y, isHovered ? 9 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'rgb(56, 189, 248)' : 'rgba(56, 189, 248, 0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  ctx.font = '10.5px Inter, system-ui';
  ctx.fillStyle = 'rgba(250, 250, 250, 0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const n of nodes) {
    if (n.data.weight < 1 && n.data.type !== 'tag') continue;
    const label = n.data.label.length > 24 ? n.data.label.slice(0, 22) + '…' : n.data.label;
    ctx.fillText(label, n.x, n.y + (n.data.type === 'tag' ? 18 : 20));
  }

  ctx.restore();
}
