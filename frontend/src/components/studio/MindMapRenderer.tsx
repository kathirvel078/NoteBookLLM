import { useMemo, useRef } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import { Download } from "lucide-react";
import type { MindMapNode, MindMapOutput } from "../../types/api";

function layoutTree(root: MindMapNode): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let leafY = 0;

  function walk(node: MindMapNode, depth: number, parentId?: string): number {
    const x = depth * 220;
    let y: number;
    if (!node.children || node.children.length === 0) {
      y = leafY * 82;
      leafY += 1;
    } else {
      const childYs = node.children.map((child) => walk(child, depth + 1, node.id));
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }

    nodes.push({
      id: node.id,
      position: { x, y },
      data: { label: node.label },
      style: {
        borderRadius: 12,
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: depth === 0 ? 700 : 500,
        border: depth === 0 ? "2px solid #4f46e5" : "1px solid #cbd5e1",
        background: depth === 0 ? "#eef2ff" : "#ffffff",
        color: "#0f172a",
        maxWidth: 180,
      },
    });

    if (parentId) {
      edges.push({
        id: `e-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        animated: false,
      });
    }
    return y;
  }

  walk(root, 0);
  return { nodes, edges };
}

export function MindMapRenderer({ data }: { data: MindMapOutput }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { nodes, edges } = useMemo(() => layoutTree(data.root), [data.root]);

  async function handleExportPng() {
    if (!containerRef.current) return;
    const dataUrl = await toPng(containerRef.current, { backgroundColor: "#ffffff" });
    const link = document.createElement("a");
    link.download = `${data.root.label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "mindmap"}.png`;
    link.href = dataUrl;
    link.click();
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500 dark:text-slate-400">
          Drag to pan · Scroll to zoom
        </span>
        <button
          type="button"
          onClick={() => void handleExportPng()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 dark:border-slate-800 dark:hover:bg-slate-900"
        >
          <Download className="h-3.5 w-3.5" />
          Export PNG
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-[340px] w-full overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-slate-800"
      >
        <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
