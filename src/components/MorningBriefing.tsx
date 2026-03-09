import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/morning-briefing.css";

interface FileHotspot {
  file_path: string;
  change_count: number;
}

interface MemoryNote {
  id: number;
  content: string;
  category: string;
  created_at: string;
}

interface DeadEnd {
  id: number;
  description: string;
  context: string;
  created_at: string;
}

interface BriefingData {
  hotFiles: FileHotspot[];
  recentNotes: MemoryNote[];
  deadEnds: DeadEnd[];
}

interface MorningBriefingProps {
  projectId: number;
}

export function MorningBriefing({ projectId }: MorningBriefingProps) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [hotFiles, recentNotes, deadEnds] = await Promise.allSettled([
          invoke<FileHotspot[]>("get_file_hotspots", {
            projectId,
            period: "24h",
          }).catch(() => []),
          invoke<MemoryNote[]>("get_memory_notes", {
            worktreeId: projectId,
            limit: 5,
          }).catch(() => []),
          invoke<DeadEnd[]>("get_dead_ends", {
            worktreeId: projectId,
            limit: 5,
          }).catch(() => []),
        ]);

        if (!cancelled) {
          setData({
            hotFiles:
              hotFiles.status === "fulfilled"
                ? (hotFiles.value as FileHotspot[])
                : [],
            recentNotes:
              recentNotes.status === "fulfilled"
                ? (recentNotes.value as MemoryNote[])
                : [],
            deadEnds:
              deadEnds.status === "fulfilled"
                ? (deadEnds.value as DeadEnd[])
                : [],
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (collapsed) {
    return (
      <div className="briefing">
        <button
          className="briefing-toggle"
          onClick={() => setCollapsed(false)}
        >
          Morning Briefing
        </button>
      </div>
    );
  }

  return (
    <div className="briefing">
      <div className="briefing-header">
        <h3 className="briefing-title">Morning Briefing</h3>
        <button
          className="briefing-collapse"
          onClick={() => setCollapsed(true)}
        >
          Collapse
        </button>
      </div>

      {loading && <p className="briefing-loading">Loading...</p>}

      {data && (
        <div className="briefing-sections">
          <section className="briefing-section">
            <h4>Hot Files (24h)</h4>
            {data.hotFiles.length === 0 ? (
              <p className="briefing-empty">No recent file activity.</p>
            ) : (
              <ul className="briefing-list">
                {data.hotFiles.slice(0, 5).map((f) => (
                  <li key={f.file_path} className="briefing-item">
                    <span className="briefing-file">{f.file_path}</span>
                    <span className="briefing-count">
                      {f.change_count} changes
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="briefing-section">
            <h4>Recent Notes</h4>
            {data.recentNotes.length === 0 ? (
              <p className="briefing-empty">No notes yet.</p>
            ) : (
              <ul className="briefing-list">
                {data.recentNotes.map((n) => (
                  <li key={n.id} className="briefing-item">
                    <span className="briefing-note">{n.content}</span>
                    <span className="briefing-category">{n.category}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.deadEnds.length > 0 && (
            <section className="briefing-section">
              <h4>Dead Ends to Avoid</h4>
              <ul className="briefing-list">
                {data.deadEnds.map((d) => (
                  <li key={d.id} className="briefing-item briefing-dead-end">
                    {d.description}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
