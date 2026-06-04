/**
 * Workflow -> SVG renderer.
 *
 * Tiny, dependency-free, deterministic layout: nodes are placed on a
 * grid by their BFS depth from the entry, with `position.x` / `position.y`
 * from the spec as overrides. The output is a self-contained SVG
 * string ready to embed in HTML, save to disk, or render in a notebook.
 *
 * This is a minimal visualizer — not a full editor. Pair it with
 * react-flow / vue-flow for a real UI; the JSON is the same.
 */

import type { WorkflowSpec, WorkflowNode, WorkflowEdge } from './workflow.js';

export interface RenderOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  hSpacing?: number;
  vSpacing?: number;
  /** Inline CSS for the root SVG. */
  style?: string;
  /** Optional class for the root SVG. */
  className?: string;
}

const DEFAULTS = {
  nodeWidth: 180,
  nodeHeight: 60,
  hSpacing: 60,
  vSpacing: 80,
};

export function renderWorkflowSVG(spec: WorkflowSpec, opts: RenderOptions = {}): string {
  const cfg = { ...DEFAULTS, ...opts };
  const positions = computeLayout(spec, cfg);

  const nodeBoxes = spec.nodes
    .map((n) => {
      const p = positions.get(n.id)!;
      const label = escape(n.data?.['label'] as string | undefined ?? n.type);
      const id = escape(n.id);
      return `
        <g class="wf-node" data-id="${id}" transform="translate(${p.x},${p.y})">
          <rect width="${cfg.nodeWidth}" height="${cfg.nodeHeight}" rx="8" fill="#1f2937" stroke="#3b82f6" stroke-width="1.5"/>
          <text x="10" y="22" fill="#9ca3af" font-size="11" font-family="ui-monospace,monospace">${escape(n.type)}</text>
          <text x="10" y="42" fill="#f3f4f6" font-size="14" font-family="ui-sans-serif,system-ui">${label}</text>
          <text x="${cfg.nodeWidth - 10}" y="22" fill="#6b7280" font-size="10" text-anchor="end" font-family="ui-monospace,monospace">${id}</text>
        </g>`;
    })
    .join('');

  const arrows = spec.edges
    .map((e) => {
      const a = positions.get(e.source);
      const b = positions.get(e.target);
      if (!a || !b) return '';
      const x1 = a.x + cfg.nodeWidth;
      const y1 = a.y + cfg.nodeHeight / 2;
      const x2 = b.x;
      const y2 = b.y + cfg.nodeHeight / 2;
      const cx = (x1 + x2) / 2;
      const label = e.label ? `<text x="${cx}" y="${(y1 + y2) / 2 - 4}" fill="#9ca3af" font-size="10" text-anchor="middle">${escape(e.label)}</text>` : '';
      return `
        <g class="wf-edge" data-from="${escape(e.source)}" data-to="${escape(e.target)}">
          <path d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}" fill="none" stroke="#6b7280" stroke-width="1.5" marker-end="url(#wf-arrow)"/>
          ${label}
        </g>`;
    })
    .join('');

  const width = Math.max(...Array.from(positions.values()).map((p) => p.x + cfg.nodeWidth)) + 20;
  const height = Math.max(...Array.from(positions.values()).map((p) => p.y + cfg.nodeHeight)) + 20;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="${escape(opts.className ?? 'wf-svg')}" style="${escape(opts.style ?? '')}">
    <defs>
      <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280"/>
      </marker>
    </defs>
    ${arrows}
    ${nodeBoxes}
  </svg>`;
}

function computeLayout(
  spec: WorkflowSpec,
  cfg: Required<RenderOptions>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const depth = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of spec.nodes) adj.set(n.id, []);
  for (const e of spec.edges) {
    const arr = adj.get(e.source) ?? [];
    arr.push(e.target);
    adj.set(e.source, arr);
  }
  // BFS from entry.
  const queue: Array<{ id: string; d: number }> = [{ id: spec.entry, d: 0 }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (depth.has(cur.id)) continue;
    depth.set(cur.id, cur.d);
    for (const nb of adj.get(cur.id) ?? []) {
      if (!depth.has(nb)) queue.push({ id: nb, d: cur.d + 1 });
    }
  }
  // Group by depth.
  const byDepth = new Map<number, string[]>();
  for (const n of spec.nodes) {
    const d = depth.get(n.id) ?? 0;
    const arr = byDepth.get(d) ?? [];
    arr.push(n.id);
    byDepth.set(d, arr);
  }
  // Place each column (depth) at x = depth * (width + hSpacing); rows
  // are stacked vertically.
  for (const [d, ids] of byDepth) {
    ids.forEach((id, idx) => {
      const override = spec.nodes.find((n) => n.id === id)?.position;
      positions.set(id, {
        x: override?.x ?? d * (cfg.nodeWidth + cfg.hSpacing),
        y: override?.y ?? idx * (cfg.nodeHeight + cfg.vSpacing),
      });
    });
  }
  return positions;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
