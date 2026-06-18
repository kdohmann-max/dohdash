import { useEffect, useState } from "react";
import {
  listFolderShares, addFolderShare, updateFolderShare, removeFolderShare,
  listProfiles, listGroups,
  type FolderShare, type Permission, type GranteeType,
} from "../../../storage/db";
import "./FolderShareModal.css";

interface Props {
  folderId: string;
  folderName: string;
  currentUserId: string;
  onClose: () => void;
}

interface RosterEntry {
  id: string;
  type: GranteeType;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export function FolderShareModal({ folderId, folderName, currentUserId, onClose }: Props) {
  const [shares, setShares] = useState<FolderShare[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [pendingPermission, setPendingPermission] = useState<Permission>('edit');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [folderShares, profiles, groups] = await Promise.all([
        listFolderShares(folderId),
        listProfiles(),
        listGroups(),
      ]);
      setShares(folderShares);
      const entries: RosterEntry[] = [
        ...profiles
          .filter((p) => p.id !== currentUserId)
          .map((p) => ({
            id: p.id, type: 'user' as const,
            name: p.displayName ?? p.email, email: p.email, avatarUrl: p.avatarUrl,
          })),
        ...groups.map((g) => ({
          id: g.id, type: 'group' as const, name: g.name, email: null, avatarUrl: null,
        })),
      ];
      setRoster(entries);
    })().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [folderId, currentUserId]);

  const shareByGrantee = new Map(shares.map((s) => [s.granteeId, s]));

  async function handleToggle(entry: RosterEntry, existing: FolderShare | undefined) {
    try {
      if (existing) {
        await removeFolderShare(existing.id);
        setShares((prev) => prev.filter((s) => s.id !== existing.id));
      } else {
        await addFolderShare(folderId, entry.type, entry.id, pendingPermission, currentUserId);
        setShares(await listFolderShares(folderId));
      }
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

  const f = filter.trim().toLowerCase();
  const visible = roster
    .filter((e) => !f || e.name.toLowerCase().includes(f) || (e.email?.toLowerCase().includes(f) ?? false))
    .sort((a, b) => {
      const as = shareByGrantee.has(a.id), bs = shareByGrantee.has(b.id);
      if (as !== bs) return as ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="fsm-backdrop" onClick={onClose}>
      <div className="fsm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fsm-head">
          <h3 className="fsm-title">Share &ldquo;{folderName}&rdquo;</h3>
          <button className="fsm-close" onClick={onClose}>✕</button>
        </div>

        {error && <p className="fsm-error">{error}</p>}

        <div className="fsm-add-section">
          <div className="fsm-perm-row">
            <label className="fsm-perm-label">New shares get:</label>
            <select
              className="fsm-perm-select"
              value={pendingPermission}
              onChange={(e) => setPendingPermission(e.target.value as Permission)}
            >
              <option value="edit">Full Edit</option>
              <option value="comment">Comment Only</option>
            </select>
          </div>
          <input
            className="fsm-search-input"
            placeholder="Filter people or groups…"
            value={filter}
            autoFocus
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <ul className="fsm-roster">
          {visible.length === 0 ? (
            <li className="fsm-roster-empty">
              {roster.length === 0 ? "No people or groups to share with" : "No matches"}
            </li>
          ) : (
            visible.map((e) => {
              const existing = shareByGrantee.get(e.id);
              return (
                <li key={e.id} className="fsm-roster-row">
                  <label className="fsm-roster-label">
                    <input
                      type="checkbox"
                      className="fsm-roster-check"
                      checked={!!existing}
                      onChange={() => void handleToggle(e, existing)}
                    />
                    {e.avatarUrl
                      ? <img className="fsm-avatar" src={e.avatarUrl} alt="" />
                      : <span className="fsm-avatar fsm-avatar--placeholder">{(e.name || '?').slice(0, 1).toUpperCase()}</span>
                    }
                    <span className="fsm-result-name">{e.name}</span>
                    <span className="fsm-type-badge">{e.type === 'group' ? 'Group' : 'User'}</span>
                  </label>
                  {existing && (
                    <select
                      className="fsm-perm-select fsm-roster-perm"
                      value={existing.permission}
                      onChange={(ev) => void handleUpdatePermission(existing.id, ev.target.value as Permission)}
                    >
                      <option value="edit">Full Edit</option>
                      <option value="comment">Comment Only</option>
                    </select>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
