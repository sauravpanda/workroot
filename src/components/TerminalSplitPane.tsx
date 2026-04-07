import {
  useCallback,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type SplitDirection = "horizontal" | "vertical";

export interface SplitNode {
  type: "split";
  direction: SplitDirection;
  ratio: number; // 0-1, size of first child
  first: PaneNode;
  second: PaneNode;
}

export interface LeafNode {
  type: "leaf";
  id: string;
}

export type PaneNode = SplitNode | LeafNode;

interface SplitPaneProps {
  node: PaneNode;
  onUpdateNode: (node: PaneNode) => void;
  renderLeaf: (id: string, isFocused: boolean) => ReactNode;
  focusedId: string | null;
  onFocusLeaf: (id: string) => void;
  leafCount: number;
  onCloseLeaf?: (id: string) => void;
  onSplitLeaf?: (id: string, direction: SplitDirection) => void;
}

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

export function SplitPane({
  node,
  onUpdateNode,
  renderLeaf,
  focusedId,
  onFocusLeaf,
  leafCount,
  onCloseLeaf,
  onSplitLeaf,
}: SplitPaneProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    paneId: string;
  } | null>(null);

  // Close context menu on click anywhere or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  if (node.type === "leaf") {
    return (
      <div
        className={`split-leaf ${focusedId === node.id ? "split-leaf-focused" : ""}`}
        onClick={() => onFocusLeaf(node.id)}
        onContextMenu={(e) => {
          if (!onCloseLeaf && !onSplitLeaf) return;
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, paneId: node.id });
        }}
      >
        {leafCount > 1 && onCloseLeaf && (
          <button
            className="split-leaf-close"
            title="Close pane (⌘⇧W)"
            onClick={(e) => {
              e.stopPropagation();
              onCloseLeaf(node.id);
            }}
          >
            ×
          </button>
        )}
        {renderLeaf(node.id, focusedId === node.id)}
        {contextMenu && contextMenu.paneId === node.id && (
          <PaneContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            canClose={leafCount > 1}
            canSplit={leafCount < 4}
            onClose={() => {
              onCloseLeaf?.(node.id);
              setContextMenu(null);
            }}
            onSplitH={() => {
              onSplitLeaf?.(node.id, "vertical");
              setContextMenu(null);
            }}
            onSplitV={() => {
              onSplitLeaf?.(node.id, "horizontal");
              setContextMenu(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <SplitContainer
      direction={node.direction}
      ratio={node.ratio}
      onRatioChange={(ratio) => onUpdateNode({ ...node, ratio })}
      first={
        <SplitPane
          node={node.first}
          onUpdateNode={(first) => onUpdateNode({ ...node, first })}
          renderLeaf={renderLeaf}
          focusedId={focusedId}
          onFocusLeaf={onFocusLeaf}
          leafCount={leafCount}
          onCloseLeaf={onCloseLeaf}
          onSplitLeaf={onSplitLeaf}
        />
      }
      second={
        <SplitPane
          node={node.second}
          onUpdateNode={(second) => onUpdateNode({ ...node, second })}
          renderLeaf={renderLeaf}
          focusedId={focusedId}
          onFocusLeaf={onFocusLeaf}
          leafCount={leafCount}
          onCloseLeaf={onCloseLeaf}
          onSplitLeaf={onSplitLeaf}
        />
      }
    />
  );
}

interface SplitContainerProps {
  direction: SplitDirection;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  first: ReactNode;
  second: ReactNode;
}

function SplitContainer({
  direction,
  ratio,
  onRatioChange,
  first,
  second,
}: SplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        let newRatio: number;
        if (direction === "horizontal") {
          newRatio = (ev.clientX - rect.left) / rect.width;
        } else {
          newRatio = (ev.clientY - rect.top) / rect.height;
        }
        newRatio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, newRatio));
        onRatioChange(newRatio);
      };

      const handleMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [direction, onRatioChange],
  );

  const isHorizontal = direction === "horizontal";
  const firstSize = `${ratio * 100}%`;
  const secondSize = `${(1 - ratio) * 100}%`;

  return (
    <div
      ref={containerRef}
      className={`split-container ${isHorizontal ? "split-horizontal" : "split-vertical"}`}
    >
      <div
        className="split-pane-child"
        style={isHorizontal ? { width: firstSize } : { height: firstSize }}
      >
        {first}
      </div>
      <div
        className={`split-divider ${isHorizontal ? "split-divider-h" : "split-divider-v"}`}
        onMouseDown={handleMouseDown}
      />
      <div
        className="split-pane-child"
        style={isHorizontal ? { width: secondSize } : { height: secondSize }}
      >
        {second}
      </div>
    </div>
  );
}

// Helper: collect all leaf IDs from a pane tree
export function collectLeafIds(node: PaneNode): string[] {
  if (node.type === "leaf") return [node.id];
  return [...collectLeafIds(node.first), ...collectLeafIds(node.second)];
}

// Helper: split a leaf node into two
export function splitLeaf(
  root: PaneNode,
  leafId: string,
  direction: SplitDirection,
  newLeafId: string,
): PaneNode {
  if (root.type === "leaf") {
    if (root.id === leafId) {
      return {
        type: "split",
        direction,
        ratio: 0.5,
        first: root,
        second: { type: "leaf", id: newLeafId },
      };
    }
    return root;
  }
  return {
    ...root,
    first: splitLeaf(root.first, leafId, direction, newLeafId),
    second: splitLeaf(root.second, leafId, direction, newLeafId),
  };
}

// Helper: remove a leaf and collapse the tree
export function removeLeaf(root: PaneNode, leafId: string): PaneNode | null {
  if (root.type === "leaf") {
    return root.id === leafId ? null : root;
  }

  const newFirst = removeLeaf(root.first, leafId);
  const newSecond = removeLeaf(root.second, leafId);

  if (newFirst === null) return newSecond;
  if (newSecond === null) return newFirst;

  return { ...root, first: newFirst, second: newSecond };
}

// Context menu for individual panes
function PaneContextMenu({
  x,
  y,
  canClose,
  canSplit,
  onClose,
  onSplitH,
  onSplitV,
}: {
  x: number;
  y: number;
  canClose: boolean;
  canSplit: boolean;
  onClose: () => void;
  onSplitH: () => void;
  onSplitV: () => void;
}) {
  return (
    <div
      className="pane-context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {canSplit && (
        <>
          <button className="pane-context-menu-item" onClick={onSplitV}>
            Split Horizontally
            <span className="pane-context-menu-shortcut">⌘⇧-</span>
          </button>
          <button className="pane-context-menu-item" onClick={onSplitH}>
            Split Vertically
            <span className="pane-context-menu-shortcut">⌘\</span>
          </button>
        </>
      )}
      {canSplit && canClose && <div className="pane-context-menu-divider" />}
      {canClose && (
        <button
          className="pane-context-menu-item pane-context-menu-item-danger"
          onClick={onClose}
        >
          Close Pane
          <span className="pane-context-menu-shortcut">⌘⇧W</span>
        </button>
      )}
    </div>
  );
}

// Hook for split pane keyboard shortcuts
export function useSplitPaneShortcuts(
  onSplitH: () => void,
  onSplitV: () => void,
  onClosePane?: () => void,
) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+\ or Ctrl+\ = vertical split
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        onSplitV();
        return;
      }
      // Cmd+Shift+- = horizontal split
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "-") {
        e.preventDefault();
        onSplitH();
        return;
      }
      // Cmd+Shift+W = close focused pane
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toUpperCase() === "W"
      ) {
        e.preventDefault();
        onClosePane?.();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onSplitH, onSplitV, onClosePane]);
}
