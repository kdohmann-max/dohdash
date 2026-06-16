import { useEffect, useState } from "react";
import {
  listNoteShares, addNoteShare, updateNoteShare, removeNoteShare,
  listProfiles, listGroups,
  type NoteShare, type Permission, type GranteeType,
} from "../../../storage/db";
import "./SharePanel.css";

interface Props {
  noteId: string;
  ownerName: string | null;
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

export function SharePanel({ noteId, ownerName, currentUserId, onClose }: Props) {
  const [shares, setShares] = useState<NoteShare[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [pendingPermission, setPendingPermission] = useState<Permission>('edit');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [noteShares, profiles, groups] = await Promise.all([
        listNoteShares(noteId),
        listProfiles(),
        listGroups(),
      ]);
      setShares(noteShares);
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
  }, [noteId, currentUserId]);

  const shareByGrantee = new Map(shares.map((s) => [s.granteeId, s]));

  async function handleToggle(entry: RosterEntry, existing: NoteShare | undefined) {
    try {
      if (existing) {
        await removeNoteShare(existing.id);
        setShares((prev) => prev.filter((s) => s.id !== existing.id));
      } else {
        await addNoteShare(noteId, entry.type, entry.id, pendingPermission, currentUserId);
        setShares(await listNoteShares(noteId));
      }
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

  const f = filter.trim().toLowerCase();
  const visible = roster
    .filter((e) => !f || e.name.toLowerCase().includes(f) || (e.email?.toLowerCase().includes(f) ?? false))
    // Already-shared float to the top, then alphabetical.
    .sort((a, b) => {
      const as = shareByGrantee.has(a.id), bs = shareByGrantee.has(b.id);
      if (as !== bs) return as ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="share-panel">
      <div className="share-panel-head">
        <h3 className="share-panel-title">Share note</h3>
        <button className="share-panel-close" onClick={onClose}>✕</button>
      </div>

      {error && <p className="share-panel-error">{error}</p>}

      <div className="share-panel-owner-row">
        <span className="share-panel-owner-label">Owner</span>
        <span className="share-panel-owner-name">{ownerName ?? "You"}</span>
      </div>

      <div className="share-add-section">
        <div className="share-perm-row">
          <label className="share-perm-label">New shares get:</label>
          <select
            className="share-perm-select"
            value={pendingPermission}
            onChange={(e) => setPendingPermission(e.target.value as Permission)}
          >
            <option value="edit">Full Edit</option>
            <option value="comment">Comment Only</option>
          </select>
        </div>
        <input
          className="share-search-input"
          placeholder="Filter people or groups…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <ul className="share-roster">
        {visible.length === 0 ? (
          <li className="share-roster-empty">
            {roster.length === 0 ? "No people or groups to share with" : "No matches"}
          </li>
        ) : (
          visible.map((e) => {
            const existing = shareByGrantee.get(e.id);
            return (
              <li key={e.id} className="share-roster-row">
                <label className="share-roster-label">
                  <input
                    type="checkbox"
                    className="share-roster-check"
                    checked={!!existing}
                    onChange={() => void handleToggle(e, existing)}
                  />
                  {e.avatarUrl
                    ? <img className="share-avatar" src={e.avatarUrl} alt="" />
                    : <span className="share-avatar share-avatar--placeholder">{(e.name || '?').slice(0, 1).toUpperCase()}</span>
                  }
                  <span className="share-result-name">{e.name}</span>
                  <span className="share-grantee-type-badge">{e.type === 'group' ? 'Group' : 'User'}</span>
                </label>
                {existing && (
                  <select
                    className="share-perm-select share-roster-perm"
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
  );
}
