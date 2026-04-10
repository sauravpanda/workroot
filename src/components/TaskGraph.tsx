import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/task-graph.css";

interface TaskDep {
  source: string;
  target: string;
  dep_type: string;
}

interface TaskDefinition {
  name: string;
  command: string;
  source: string;
  description: string | null;
}

interface TaskGraphProps {
  cwd: string;
  onClose: () => void;
}

interface NodeLayout {
  id: string;
  x: number;
  y: number;
  layer: number;
  hasDeps: boolean;
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 36;
const LAYER_GAP_Y = 70;
const NODE_GAP_X = 30;
const PADDING = 40;

/**
 * Topological sort producing layers for a top-down DAG layout.
 * Returns an array of layers, each containing node IDs.
 */
function topoLayers(
  nodes: string[],
  edges: TaskDep[],
): { layers: string[][]; valid: boolean } {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n, 0);
    adjacency.set(n, []);
  }

  for (const e of edges) {
    if (!inDegree.has(e.source) || !inDegree.has(e.target)) continue;
    adjacency.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const layers: string[][] = [];
  const visited = new Set<string>();

  // BFS by layers
  let current = nodes.filter((n) => inDegree.get(n) === 0);

  while (current.length > 0) {
    layers.push(current);
    const next: string[] = [];
    for (const node of current) {
      visited.add(node);
      for (const neighbor of adjacency.get(node) ?? []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1);
        if (inDegree.get(neighbor) === 0 && !visited.has(neighbor)) {
          next.push(neighbor);
        }
      }
    }
    current = next;
  }

  // Any remaining nodes (cycles or disconnected) go in last layer
  const remaining = nodes.filter((n) => !visited.has(n));
  if (remaining.length > 0) {
    layers.push(remaining);
  }

  return { layers, valid: remaining.length === 0 };
}

export function TaskGraph({ cwd, onClose }: TaskGraphProps) {
  const [deps, setDeps] = useState<TaskDep[]>([]);
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [depResult, taskResult] = await Promise.all([
        invoke<TaskDep[]>("get_task_deps", { cwd }),
        invoke<TaskDefinition[]>("discover_tasks", { path: cwd }),
      ]);
      setDeps(depResult);
      setTasks(taskResult);
    } catch {
      setDeps([]);
      setTasks([]);
    }
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build node set: all tasks + any nodes referenced in deps
  const nodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) ids.add(t.name);
    for (const d of deps) {
      ids.add(d.source);
      ids.add(d.target);
    }
    return Array.from(ids);
  }, [tasks, deps]);

  // Nodes involved in deps (have accent border)
  const depNodeIds = useMemo(() => {
    const s = new Set<string>();
    for (const d of deps) {
      s.add(d.source);
      s.add(d.target);
    }
    return s;
  }, [deps]);

  // Compute layout
  const { nodeLayouts, svgWidth, svgHeight } = useMemo(() => {
    if (nodeIds.length === 0)
      return { nodeLayouts: [] as NodeLayout[], svgWidth: 0, svgHeight: 0 };

    const { layers } = topoLayers(nodeIds, deps);

    const layouts: NodeLayout[] = [];
    let maxW = 0;

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const layerWidth =
        layer.length * NODE_WIDTH + (layer.length - 1) * NODE_GAP_X;
      if (layerWidth > maxW) maxW = layerWidth;
    }

    const totalWidth = maxW + PADDING * 2;

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const layerWidth =
        layer.length * NODE_WIDTH + (layer.length - 1) * NODE_GAP_X;
      const startX = (totalWidth - layerWidth) / 2;
      const y = PADDING + li * LAYER_GAP_Y;

      for (let ni = 0; ni < layer.length; ni++) {
        const nodeId = layer[ni];
        layouts.push({
          id: nodeId,
          x: startX + ni * (NODE_WIDTH + NODE_GAP_X),
          y,
          layer: li,
          hasDeps: depNodeIds.has(nodeId),
        });
      }
    }

    return {
      nodeLayouts: layouts,
      svgWidth: totalWidth,
      svgHeight: PADDING * 2 + layers.length * LAYER_GAP_Y,
    };
  }, [nodeIds, deps, depNodeIds]);

  // Map node id → layout for edge drawing
  const nodeMap = useMemo(() => {
    const m = new Map<string, NodeLayout>();
    for (const n of nodeLayouts) m.set(n.id, n);
    return m;
  }, [nodeLayouts]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const task = tasks.find((t) => t.name === nodeId);
      if (task) {
        // Dispatch a custom event so the command palette can pick it up
        window.dispatchEvent(
          new CustomEvent("task-graph:run", { detail: task.command }),
        );
        onClose();
      }
    },
    [tasks, onClose],
  );

  return (
    <div className="task-graph-backdrop" onClick={onClose}>
      <div className="task-graph-panel" onClick={(e) => e.stopPropagation()}>
        <div className="task-graph-header">
          <h3 className="task-graph-title">Task Dependencies</h3>
          <button className="task-graph-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="task-graph-canvas">
          {loading ? (
            <div className="task-graph-empty">Loading dependencies...</div>
          ) : nodeLayouts.length === 0 ? (
            <div className="task-graph-empty">
              No tasks found in this directory.
            </div>
          ) : (
            <svg
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="6"
                  refX="8"
                  refY="3"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 8 3, 0 6"
                    className="task-graph-arrowhead"
                  />
                </marker>
              </defs>

              {/* Edges */}
              {deps.map((dep, i) => {
                const src = nodeMap.get(dep.source);
                const tgt = nodeMap.get(dep.target);
                if (!src || !tgt) return null;

                const x1 = src.x + NODE_WIDTH / 2;
                const y1 = src.y + NODE_HEIGHT;
                const x2 = tgt.x + NODE_WIDTH / 2;
                const y2 = tgt.y;

                // Curved path for better readability
                const midY = (y1 + y2) / 2;
                const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

                return (
                  <path key={`edge-${i}`} d={d} className="task-graph-edge" />
                );
              })}

              {/* Nodes */}
              {nodeLayouts.map((node) => (
                <g
                  key={node.id}
                  className="task-graph-node"
                  onClick={() => handleNodeClick(node.id)}
                >
                  <rect
                    className={`task-graph-node-rect${node.hasDeps ? " task-graph-node-rect--has-deps" : ""}`}
                    x={node.x}
                    y={node.y}
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                  />
                  <text
                    className="task-graph-node-label"
                    x={node.x + NODE_WIDTH / 2}
                    y={node.y + NODE_HEIGHT / 2}
                  >
                    {node.id.length > 14
                      ? node.id.substring(0, 12) + "..."
                      : node.id}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
