import { useEffect, useRef, useState } from "react";
import {
  listGroups, createGroup, updateGroup, deleteGroup,
  listGroupMembers, addGroupMember, removeGroupMember, listProfiles,
  type Group, type GroupMember, type Profile,
} from "../storage/db";
import { useAuth } from "../auth/AuthContext";
import "./GroupsPanel.css";

export function GroupsPanel() {
  const { state } = useAuth();
  const currentUserId = state.status === "authenticated" ? state.profile.id : null;

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [descValue, setDescValue] = useState("");
  const [creatingName, setCreatingName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  useEffect(() => {
    void (async () => {
      try {
        const [list, profileList] = await Promise.all([listGroups(), listProfiles()]);
        setGroups(list);
        setProfiles(profileList);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) { setMembers([]); return; }
    void listGroupMembers(selectedId).then(setMembers).catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    if (selected) {
      setNameValue(selected.name);
      setDescValue(selected.description ?? "");
      setEditingName(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleCreate() {
    const name = creatingName.trim();
    if (!name || !currentUserId) return;
    try {
      const group = await createGroup(name, null, currentUserId);
      setGroups((prev) => [...prev, group].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedId(group.id);
      setShowCreate(false);
      setCreatingName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSaveName() {
    if (!selected || !nameValue.trim()) return;
    try {
      await updateGroup(selected.id, nameValue.trim(), descValue || null);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === selected.id ? { ...g, name: nameValue.trim(), description: descValue || null } : g
        ).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSaveDesc() {
    if (!selected) return;
    try {
      await updateGroup(selected.id, selected.name, descValue || null);
      setGroups((prev) =>
        prev.map((g) => (g.id === selected.id ? { ...g, description: descValue || null } : g))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteGroup(id: string) {
    try {
      await deleteGroup(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      if (selectedId === id) setSelectedId(null);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Single toggle: checking a user adds them to the group, unchecking removes
  // them. Keeps the filter text so an admin can tick several users in a row.
  async function handleToggleMember(userId: string, isMember: boolean) {
    if (!selectedId || !currentUserId) return;
    try {
      if (isMember) {
        await removeGroupMember(selectedId, userId);
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      } else {
        await addGroupMember(selectedId, userId, currentUserId);
        setMembers(await listGroupMembers(selectedId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const memberIds = new Set(members.map((m) => m.userId));
  const filter = memberSearch.trim().toLowerCase();
  const roster = profiles
    .filter(
      (p) =>
        !filter ||
        p.displayName?.toLowerCase().includes(filter) ||
        p.email.toLowerCase().includes(filter)
    )
    // Current members float to the top, then alphabetical by name/email.
    .sort((a, b) => {
      const am = memberIds.has(a.id), bm = memberIds.has(b.id);
      if (am !== bm) return am ? -1 : 1;
      return (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email);
    });

  return (
    <div className="groups-panel">
      {error && <p className="groups-error">{error}</p>}
      <div className="groups-left">
        <div className="groups-list-head">
          <span className="groups-list-title">Groups</span>
          <button className="groups-new-btn" onClick={() => setShowCreate(true)}>+ New</button>
        </div>
        {showCreate && (
          <div className="groups-create-row">
            <input
              className="groups-create-input"
              placeholder="Group name…"
              value={creatingName}
              autoFocus
              onChange={(e) => setCreatingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") { setShowCreate(false); setCreatingName(""); }
              }}
            />
            <button className="groups-create-confirm" onClick={() => void handleCreate()}>Create</button>
            <button className="groups-create-cancel" onClick={() => { setShowCreate(false); setCreatingName(""); }}>✕</button>
          </div>
        )}
        <ul className="groups-list">
          {groups.length === 0 && !showCreate && (
            <li className="groups-empty">No groups yet</li>
          )}
          {groups.map((g) => (
            <li
              key={g.id}
              className={`groups-list-item${g.id === selectedId ? " active" : ""}`}
              onClick={() => setSelectedId(g.id)}
            >
              <span className="groups-list-name">{g.name}</span>
              <span className="groups-list-count">{g.id === selectedId ? `${members.length}` : ""}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="groups-right">
        {!selected ? (
          <p className="groups-no-selection">Select a group to manage it</p>
        ) : (
          <>
            <div className="groups-detail-head">
              {editingName ? (
                <input
                  ref={nameInputRef}
                  className="groups-name-input"
                  value={nameValue}
                  autoFocus
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSaveName();
                    if (e.key === "Escape") { setNameValue(selected.name); setEditingName(false); }
                  }}
                  onBlur={() => void handleSaveName()}
                />
              ) : (
                <h2 className="groups-name" onClick={() => setEditingName(true)} title="Click to rename">
                  {selected.name}
                </h2>
              )}
            </div>

            <div className="groups-desc-row">
              <textarea
                className="groups-desc-input"
                placeholder="Add a description…"
                value={descValue}
                rows={2}
                onChange={(e) => setDescValue(e.target.value)}
                onBlur={() => void handleSaveDesc()}
              />
            </div>

            <section className="groups-members-section">
              <h3 className="groups-section-title">Members ({members.length})</h3>
              <p className="groups-roster-hint">
                Check a person to add them to this group; uncheck to remove them.
              </p>
              <input
                className="groups-member-search"
                placeholder="Filter people by name or email…"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
              <ul className="groups-roster">
                {roster.length === 0 ? (
                  <li className="groups-roster-empty">
                    {profiles.length === 0 ? "No people to add yet" : "No matches"}
                  </li>
                ) : (
                  roster.map((p) => {
                    const isMember = memberIds.has(p.id);
                    return (
                      <li key={p.id} className="groups-roster-row">
                        <label className="groups-roster-label">
                          <input
                            type="checkbox"
                            className="groups-roster-check"
                            checked={isMember}
                            onChange={() => void handleToggleMember(p.id, isMember)}
                          />
                          {p.avatarUrl ? (
                            <img className="groups-avatar groups-avatar--sm" src={p.avatarUrl} alt="" />
                          ) : (
                            <span className="groups-avatar groups-avatar--placeholder groups-avatar--sm">
                              {(p.displayName ?? p.email).slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="groups-roster-name">{p.displayName ?? p.email}</span>
                          <span className="groups-roster-email">{p.email}</span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>

            <div className="groups-danger-zone">
              {confirmDeleteId === selected.id ? (
                <div className="groups-confirm-delete">
                  <span>Delete "{selected.name}"?</span>
                  <button className="groups-delete-confirm-btn" onClick={() => void handleDeleteGroup(selected.id)}>
                    Yes, delete
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                </div>
              ) : (
                <button className="groups-delete-btn" onClick={() => setConfirmDeleteId(selected.id)}>
                  Delete group
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
