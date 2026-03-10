import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/docker-images.css";

interface DockerImage {
  repository: string;
  tag: string;
  image_id: string;
  size: string;
  created: string;
}

interface DockerImagesProps {
  onClose: () => void;
}

export function DockerImages({ onClose }: DockerImagesProps) {
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DockerImage[]>("list_docker_images");
      setImages(result);
    } catch (e) {
      setError(String(e));
      setImages([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  const handleDelete = useCallback(
    async (imageId: string) => {
      setActionLoading(imageId);
      try {
        await invoke("remove_docker_image", { imageId });
        await loadImages();
      } catch (e) {
        setError(String(e));
      }
      setActionLoading(null);
    },
    [loadImages],
  );

  const handlePrune = useCallback(async () => {
    setPruning(true);
    try {
      await invoke("prune_docker_images");
      await loadImages();
    } catch (e) {
      setError(String(e));
    }
    setPruning(false);
  }, [loadImages]);

  return (
    <div className="dkimg-backdrop" onClick={onClose}>
      <div className="dkimg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dkimg-header">
          <h3 className="dkimg-title">Docker Images</h3>
          <div className="dkimg-header-actions">
            <button
              className="dkimg-prune-btn"
              onClick={handlePrune}
              disabled={pruning}
            >
              {pruning ? "Pruning..." : "Prune Dangling"}
            </button>
            <button
              className="dkimg-refresh-btn"
              onClick={loadImages}
              disabled={loading}
            >
              Refresh
            </button>
            <button className="dkimg-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="dkimg-body">
          {error && <div className="dkimg-error">{error}</div>}

          {loading ? (
            <div className="dkimg-empty">Loading images...</div>
          ) : images.length === 0 ? (
            <div className="dkimg-empty">No Docker images found.</div>
          ) : (
            <table className="dkimg-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Tag</th>
                  <th>Size</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {images.map((img) => (
                  <tr key={img.image_id} className="dkimg-row">
                    <td className="dkimg-cell-repo">{img.repository}</td>
                    <td className="dkimg-cell-tag">{img.tag}</td>
                    <td className="dkimg-cell-size">{img.size}</td>
                    <td className="dkimg-cell-created">{img.created}</td>
                    <td className="dkimg-cell-action">
                      <button
                        className="dkimg-delete-btn"
                        onClick={() => handleDelete(img.image_id)}
                        disabled={actionLoading === img.image_id}
                      >
                        {actionLoading === img.image_id ? "..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
