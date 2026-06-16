import { useCallback, useEffect, useRef, useState } from "react";
import {
  listNoteShares, addNoteShare, updateNoteShare, removeNoteShare,
  searchShareTargets, listProfiles, listGroups,
  type NoteShare, type Permission, type ShareTarget,
} from "../../../storage/db";
import "./SharePanel.css";

interface Props {
  noteId: string;
  ownerName: string | null;
  currentUserId: string;
  onClose: () => void;
}

export function SharePanel({ noteId, ownerName, currentUserId, onClose }: Props) {
  const [shares, setShares] = useState<NoteShare[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShareTarget[]>([]);
  const [pendingPermission, setPendingPermission] = useState<Permission>('edit');
  const [error, setError] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const [noteShares, profiles, groups] = await Promise.all([
        listNoteShares(noteId),
        listProfiles(),
        listGroups(),
      ]);
      setShares(noteShares);
      const map = new Map<string, string>();
      profiles.forEach((p) => map.set(p.id, p.displayName ?? p.email));
      groups.forEach((g) => map.set(g.id, g.name));
      setNameMap(map);
    })().catch(() => {});
  }, [noteId]);

  const doSearch = useCallback((q: string) => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!q.trim()) { setResults([]); return; }
    searchRef.current = setTimeout(() => {
      void searchShareTargets(q).then(setResults).catch(() => setResults([]));
    }, 200);
  }, []);

  useEffect(() => { doSearch(query); }, [query, doSearch]);

  async function handleAdd(target: ShareTarget) {
    try {
      await addNoteShare(noteId, target.type, target.id, pendingPermission, currentUserId);
      setShares(await listNoteShares(noteId));
      setQuery("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUpdatePermission(shareId: string, permission: Permission) {
    try {
      await updateNoteShare(shareId, permission);
      setShares((prev) => prev.map((s) => (s.id === shareId ? { ...s, permission } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemove(shareId: string) {
    try {
      await removeNoteShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="share-panel" ref={panelRef}>
      <div className="share-panel-head">
        <h3 className="share-panel-title">Share note</h3>
        <button className="share-panel-close" onClick={onClose}>✕</button>
      </div>

      {error && <p className="share-panel-error">{error}</p>}

      <div className="share-panel-owner-row">
        <span className="share-panel-owner-label">Owner</span>
        <span className="share-panel-owner-name">{ownerName ?? "You"}</span>
      </div>

      {shares.length > 0 && (
        <ul className="share-list">
          {shares.map((s) => (
            <li key={s.id} className="share-row">
              <span className="share-grantee-type-badge">{s.granteeType === 'group' ? 'Group' : 'User'}</span>
              <span className="share-grantee-id">{nameMap.get(s.granteeId) ?? s.granteeId.slice(0, 8) + '…'}</span>
              <select
                className="share-perm-select"
                value={s.permission}
                onChange={(e) => void handleUpdatePermission(s.id, e.target.value as Permission)}
              >
                <option value="edit">Full Edit</option>
                <option value="comment">Comment Only</option>
              </select>
              <button className="share-remove-btn" onClick={() => void handleRemove(s.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="share-add-section">
        <div className="share-perm-row">
          <label className="share-perm-label">Permission for new share:</label>
          <select
            className="share-perm-select"
            value={pendingPermission}
            onChange={(e) => setPendingPermission(e.target.value as Permission)}
          >
            <option value="edit">Full Edit</option>
            <option value="comment">Comment Only</option>
          </select>
        </div>
        <div className="share-search-wrap">
          <input
            className="share-search-input"
            placeholder="Search users or groups…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <ul className="share-results">
              {results.map((r) => (
                <li
                  key={r.id}
                  className="share-result-item"
                  onMouseDown={(e) => { e.preventDefault(); void handleAdd(r); }}
                >
                  {r.avatarUrl
                    ? <img className="share-avatar" src={r.avatarUrl} alt="" />
                    : <span className="share-avatar share-avatar--placeholder">{(r.name ?? '?').slice(0, 1).toUpperCase()}</span>
                  }
                  <span className="share-result-name">{r.name}</span>
                  <span className="share-result-type">{r.type === 'group' ? 'Group' : 'User'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
