import { useCallback, useEffect, useRef, useState } from "react";
import {
  listFolderShares, addFolderShare, updateFolderShare, removeFolderShare,
  searchShareTargets,
  type FolderShare, type Permission, type ShareTarget,
} from "../../../storage/db";
import "./FolderShareModal.css";

interface Props {
  folderId: string;
  folderName: string;
  currentUserId: string;
  onClose: () => void;
}

export function FolderShareModal({ folderId, folderName, currentUserId, onClose }: Props) {
  const [shares, setShares] = useState<FolderShare[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShareTarget[]>([]);
  const [pendingPermission, setPendingPermission] = useState<Permission>('edit');
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void listFolderShares(folderId).then(setShares).catch(() => {});
  }, [folderId]);

  const doSearch = useCallback((q: string) => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!q.trim()) { setResults([]); return; }
    searchRef.current = setTimeout(() => {
      void searchShareTargets(q).then(setResults).catch(() => setResults([]));
    }, 200);
  }, []);

  // doSearch is stable (useCallback []) — only depend on query
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { doSearch(query); }, [query]);

  async function handleAdd(target: ShareTarget) {
    try {
      await addFolderShare(folderId, target.type, target.id, pendingPermission, currentUserId);
      setShares(await listFolderShares(folderId));
      setQuery("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUpdatePermission(shareId: string, permission: Permission) {
    try {
      await updateFolderShare(shareId, permission);
      setShares((prev) => prev.map((s) => (s.id === shareId ? { ...s, permission } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemove(shareId: string) {
    try {
      await removeFolderShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="fsm-backdrop" onClick={onClose}>
      <div className="fsm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fsm-head">
          <h3 className="fsm-title">Share &ldquo;{folderName}&rdquo;</h3>
          <button className="fsm-close" onClick={onClose}>✕</button>
        </div>

        {error && <p className="fsm-error">{error}</p>}

        {shares.length > 0 && (
          <ul className="fsm-share-list">
            {shares.map((s) => (
              <li key={s.id} className="fsm-share-row">
                <span className="fsm-type-badge">{s.granteeType === 'group' ? 'Group' : 'User'}</span>
                <span className="fsm-grantee-id">{s.granteeId.slice(0, 8)}…</span>
                <select
                  className="fsm-perm-select"
                  value={s.permission}
                  onChange={(e) => void handleUpdatePermission(s.id, e.target.value as Permission)}
                >
                  <option value="edit">Full Edit</option>
                  <option value="comment">Comment Only</option>
                </select>
                <button className="fsm-remove-btn" onClick={() => void handleRemove(s.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}

        <div className="fsm-add-section">
          <div className="fsm-perm-row">
            <label className="fsm-perm-label">Permission:</label>
            <select
              className="fsm-perm-select"
              value={pendingPermission}
              onChange={(e) => setPendingPermission(e.target.value as Permission)}
            >
              <option value="edit">Full Edit</option>
              <option value="comment">Comment Only</option>
            </select>
          </div>
          <div className="fsm-search-wrap">
            <input
              className="fsm-search-input"
              placeholder="Search users or groups…"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
            {results.length > 0 && (
              <ul className="fsm-results">
                {results.map((r) => (
                  <li
                    key={r.id}
                    className="fsm-result-item"
                    onMouseDown={(e) => { e.preventDefault(); void handleAdd(r); }}
                  >
                    {r.avatarUrl
                      ? <img className="fsm-avatar" src={r.avatarUrl} alt="" />
                      : <span className="fsm-avatar fsm-avatar--placeholder">{(r.name ?? '?').slice(0, 1).toUpperCase()}</span>
                    }
                    <span className="fsm-result-name">{r.name}</span>
                    <span className="fsm-result-type">{r.type === 'group' ? 'Group' : 'User'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
