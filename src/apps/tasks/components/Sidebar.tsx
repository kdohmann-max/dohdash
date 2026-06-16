import { useEffect, useRef, useState } from "react";
import type { DocMeta, Folder } from "../../../storage/db";
import type { ViewMode } from "../TasksApp";
import { FolderShareModal } from "./FolderShareModal";

export type SortMode = "edited" | "name";

interface Props {
  docs: DocMeta[];
  folders: Folder[];
  activeId: string | null;
  search: string;
  onSearch: (value: string) => void;
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  onSelect: (id: string) => void;
  onCreateInFolder: (folderId: string | null) => void;
  onDelete: (id: string) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelectMode: () => void;
  onToggleSelect: (id: string) => void;
  onBulkDelete: () => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  sharedFolderIds: Set<string>;
  currentUserId: string | null;
}

type Tree = Map<string | null, Folder[]>;

function buildTree(folders: Folder[]): Tree {
  const map: Tree = new Map();
  for (const f of folders) {
    const arr = map.get(f.parentId) ?? [];
    arr.push(f);
    map.set(f.parentId, arr);
  }
  return map;
}

// ---- Shared inline input ----

function InlineInput({
  placeholder = "Name…",
  defaultValue = "",
  depth,
  onConfirm,
  onCancel,
}: {
  placeholder?: string;
  defaultValue?: string;
  depth: number;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    if (defaultValue) ref.current?.select();
  }, [defaultValue]);

  return (
    <li
      className="inline-input-item"
      style={{ paddingLeft: `${10 + depth * 16}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={ref}
        className="inline-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (value.trim()) onConfirm(value.trim());
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={onCancel}
      />
    </li>
  );
}

// ---- DocItem ----

interface DocItemProps {
  doc: DocMeta;
  activeId: string | null;
  depth: number;
  folders: Folder[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

function DocItem({ doc, activeId, depth, folders, onSelect, onDelete, onMoveDoc, selectMode, selected, onToggleSelect }: DocItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function closeMenu() {
    setShowMenu(false);
    setConfirmDelete(false);
  }

  return (
    <li
      className={`doc-item${doc.id === activeId ? " active" : ""}`}
      style={{ paddingLeft: `${10 + depth * 16}px` }}
      onClick={() => { if (selectMode) onToggleSelect(doc.id); else { onSelect(doc.id); closeMenu(); } }}
    >
      {selectMode && (
        <input
          className="doc-checkbox"
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(doc.id)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <span className="doc-title">{doc.title || "Untitled"}</span>
      {!selectMode && (
      <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
        <button className="doc-menu-btn" title="Options" onClick={() => setShowMenu((v) => !v)}>
          ⋯
        </button>
        {showMenu && !confirmDelete && (
          <div className="doc-menu">
            <div className="doc-menu-label">Move to</div>
            <button onClick={() => { onMoveDoc(doc.id, null); closeMenu(); }}>Root</button>
            {folders.map((f) => (
              <button key={f.id} onClick={() => { onMoveDoc(doc.id, f.id); closeMenu(); }}>
                {f.name}
              </button>
            ))}
            <div className="doc-menu-sep" />
            <button className="doc-menu-delete" onClick={() => setConfirmDelete(true)}>
              Delete…
            </button>
          </div>
        )}
        {showMenu && confirmDelete && (
          <div className="doc-menu">
            <div className="doc-menu-label">Delete this note?</div>
            <button
              className="doc-menu-delete"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { closeMenu(); onDelete(doc.id); }}
            >
              Yes, delete
            </button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
      )}
    </li>
  );
}

// ---- FolderNode ----

interface FolderNodeProps {
  folder: Folder;
  depth: number;
  tree: Tree;
  docs: DocMeta[];
  activeId: string | null;
  folders: Folder[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onCreateInFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  sharedFolderIds: Set<string>;
  currentUserId: string | null;
}

function FolderNode({
  folder, depth, tree, docs, activeId, folders,
  onSelect, onDelete, onMoveDoc, onCreateInFolder,
  onCreateFolder, onRenameFolder, onDeleteFolder,
  selectMode, selectedIds, onToggleSelect,
  sharedFolderIds, currentUserId,
}: FolderNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const children = tree.get(folder.id) ?? [];
  const folderDocs = docs.filter((d) => d.folderId === folder.id);

  function closeMenu() {
    setMenuOpen(false);
    setConfirmDelete(false);
  }

  return (
    <>
      <li className="folder-item" style={{ paddingLeft: `${10 + depth * 16}px` }}>
        <button
          className="folder-toggle"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▼" : "▶"}
        </button>

        {renaming ? (
          <input
            className="folder-rename-input"
            defaultValue={folder.name}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = (e.target as HTMLInputElement).value.trim();
                if (v && v !== folder.name) onRenameFolder(folder.id, v);
                setRenaming(false);
              }
              if (e.key === "Escape") { e.preventDefault(); setRenaming(false); }
            }}
            onBlur={() => setRenaming(false)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="folder-name">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ marginRight: 4, opacity: 0.7, flexShrink: 0 }}>
              <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.764c.414 0 .8.182 1.06.5l.5.625A1.5 1.5 0 0 0 8.9 3.75H13.5A1.5 1.5 0 0 1 15 5.25v7.25A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9Z"/>
            </svg>
            {folder.name}
            {sharedFolderIds.has(folder.id) && (
              <svg className="folder-shared-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Shared">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            )}
          </span>
        )}

        <div className="folder-actions">
          <button
            className="folder-add-btn"
            title="New note in folder"
            onClick={() => onCreateInFolder(folder.id)}
          >+</button>
          <button
            className="folder-menu-btn"
            title="Folder options"
            onClick={() => { setMenuOpen((v) => !v); setConfirmDelete(false); }}
          >⋯</button>

          {menuOpen && !confirmDelete && (
            <div className="folder-menu">
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { closeMenu(); setRenaming(true); }}>Rename</button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { closeMenu(); setExpanded(true); setAddingChild(true); }}>New subfolder</button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { closeMenu(); setShareModalOpen(true); }}>Share folder</button>
              <div className="folder-menu-sep" />
              <button className="folder-menu-delete" onMouseDown={(e) => e.preventDefault()} onClick={() => setConfirmDelete(true)}>Delete…</button>
            </div>
          )}
          {menuOpen && confirmDelete && (
            <div className="folder-menu">
              <div className="folder-menu-label">Delete "{folder.name}"?</div>
              <button
                className="folder-menu-delete"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { closeMenu(); onDeleteFolder(folder.id); }}
              >Yes, delete</button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </div>
      </li>

      {expanded && (
        <>
          {addingChild && (
            <InlineInput
              placeholder="Subfolder name…"
              depth={depth + 1}
              onConfirm={(name) => { setAddingChild(false); onCreateFolder(name, folder.id); }}
              onCancel={() => setAddingChild(false)}
            />
          )}
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              tree={tree}
              docs={docs}
              activeId={activeId}
              folders={folders}
              onSelect={onSelect}
              onDelete={onDelete}
              onMoveDoc={onMoveDoc}
              onCreateInFolder={onCreateInFolder}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              sharedFolderIds={sharedFolderIds}
              currentUserId={currentUserId}
            />
          ))}
          {folderDocs.map((doc) => (
            <DocItem
              key={doc.id}
              doc={doc}
              activeId={activeId}
              depth={depth + 1}
              folders={folders}
              onSelect={onSelect}
              onDelete={onDelete}
              onMoveDoc={onMoveDoc}
              selectMode={selectMode}
              selected={selectedIds.has(doc.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </>
      )}
      {shareModalOpen && currentUserId && (
        <FolderShareModal
          folderId={folder.id}
          folderName={folder.name}
          currentUserId={currentUserId}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </>
  );
}

// ---- Sidebar ----

export function Sidebar({
  docs, folders, activeId, search, onSearch, sort, onSort,
  onSelect, onCreateInFolder, onDelete, onMoveDoc,
  onCreateFolder, onRenameFolder, onDeleteFolder,
  isOpen, onClose,
  selectMode, selectedIds, onToggleSelectMode, onToggleSelect, onBulkDelete,
  view, onViewChange,
  sharedFolderIds, currentUserId,
}: Props) {
  const [addingRoot, setAddingRoot] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const tree = buildTree(folders);

  const sharedDocs = docs.filter((d) => d.effectivePermission !== 'owner' && d.effectivePermission != null);
  const ownedDocs = docs.filter((d) => d.effectivePermission === 'owner' || d.effectivePermission == null);

  const sharedByOwner = new Map<string, { name: string | null; avatar: string | null; docs: DocMeta[] }>();
  for (const doc of sharedDocs) {
    const key = doc.ownerId ?? 'unknown';
    if (!sharedByOwner.has(key)) {
      sharedByOwner.set(key, { name: doc.ownerName ?? null, avatar: doc.ownerAvatarUrl ?? null, docs: [] });
    }
    sharedByOwner.get(key)!.docs.push(doc);
  }

  function cancelSelectMode() {
    setConfirmBulkDelete(false);
    onToggleSelectMode();
  }

  return (
    <aside className={`sidebar${isOpen ? " open" : ""}`}>
      <div className="sidebar-head">
        <span className="brand">DohDocs</span>
        {selectMode ? (
          confirmBulkDelete ? (
            <div className="select-bar">
              <span className="select-count">Delete {selectedIds.size} notes?</span>
              <button className="select-delete" onClick={() => { setConfirmBulkDelete(false); onBulkDelete(); }}>
                Yes, delete
              </button>
              <button className="select-cancel" onClick={() => setConfirmBulkDelete(false)}>Cancel</button>
            </div>
          ) : (
            <div className="select-bar">
              <span className="select-count">{selectedIds.size} selected</span>
              <button
                className="select-delete"
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmBulkDelete(true)}
              >
                Delete
              </button>
              <button className="select-cancel" onClick={cancelSelectMode}>Cancel</button>
            </div>
          )
        ) : (
          <div className="head-actions">
            <button className="new-folder" onClick={() => setAddingRoot(true)} title="New folder">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.764c.414 0 .8.182 1.06.5l.5.625A1.5 1.5 0 0 0 8.9 3.75H13.5A1.5 1.5 0 0 1 15 5.25v7.25A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9Z"/>
              </svg>
              +
            </button>
            <button className="new-doc" onClick={() => onCreateInFolder(null)} title="New document">+</button>
            <button className="select-toggle" onClick={onToggleSelectMode} title="Select notes">Select</button>
            <button className="sidebar-close" onClick={onClose} title="Close menu">✕</button>
          </div>
        )}
      </div>

      <div className="sidebar-controls">
        <div className="view-toggle">
          {(['mine', 'shared', 'all'] as ViewMode[]).map((v) => (
            <button
              key={v}
              className={`view-toggle-btn${view === v ? ' active' : ''}`}
              onClick={() => onViewChange(v)}
            >
              {v === 'mine' ? 'Mine' : v === 'shared' ? 'Shared' : 'All'}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          type="search"
          placeholder="Search notes…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <label className="sort-control" title="Sort notes">
          <span className="sort-label">Sort</span>
          <select value={sort} onChange={(e) => onSort(e.target.value as SortMode)}>
            <option value="edited">Last edited</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <ul className="doc-list">
        {view === 'shared' ? (
          sharedDocs.length === 0
            ? <li className="empty">{search ? "No matches" : "Nothing shared with you yet"}</li>
            : Array.from(sharedByOwner.entries()).map(([ownerId, group]) => (
                <li key={ownerId} className="shared-owner-group">
                  <div className="shared-owner-header">
                    {group.avatar
                      ? <img className="shared-owner-avatar" src={group.avatar} alt="" />
                      : <span className="shared-owner-avatar shared-owner-avatar--placeholder">{(group.name ?? '?').slice(0, 1).toUpperCase()}</span>
                    }
                    <span className="shared-owner-name">{group.name ?? 'Unknown'}</span>
                  </div>
                  <ul className="shared-docs-list">
                    {group.docs.map((doc) => (
                      <li key={doc.id}
                        className={`doc-item${doc.id === activeId ? ' active' : ''}`}
                        style={{ paddingLeft: '26px' }}
                        onClick={() => onSelect(doc.id)}
                      >
                        <span className="doc-title">{doc.title || 'Untitled'}</span>
                        <span className={`doc-perm-badge doc-perm-badge--${doc.effectivePermission}`}>
                          {doc.effectivePermission === 'edit' ? 'Edit' : 'Comment'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))
        ) : (
          <>
            {addingRoot && (
              <InlineInput
                placeholder="Folder name…"
                depth={0}
                onConfirm={(name) => { setAddingRoot(false); onCreateFolder(name, null); }}
                onCancel={() => setAddingRoot(false)}
              />
            )}
            {ownedDocs.length === 0 && folders.filter((f) => f.ownerId === currentUserId || !f.ownerId).length === 0 && !addingRoot && (
              <li className="empty">{search ? "No matches" : "No documents yet"}</li>
            )}
            {folders.filter((f) => (f.ownerId === currentUserId || !f.ownerId) && f.parentId === null).map((f) => (
              <FolderNode
                key={f.id}
                folder={f}
                depth={0}
                tree={tree}
                docs={ownedDocs}
                activeId={activeId}
                folders={folders}
                onSelect={onSelect}
                onDelete={onDelete}
                onMoveDoc={onMoveDoc}
                onCreateInFolder={onCreateInFolder}
                onCreateFolder={onCreateFolder}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                sharedFolderIds={sharedFolderIds}
                currentUserId={currentUserId}
              />
            ))}
            {ownedDocs.filter((d) => d.folderId === null).map((doc) => (
              <DocItem
                key={doc.id}
                doc={doc}
                activeId={activeId}
                depth={0}
                folders={folders}
                onSelect={onSelect}
                onDelete={onDelete}
                onMoveDoc={onMoveDoc}
                selectMode={selectMode}
                selected={selectedIds.has(doc.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
            {view === 'all' && sharedDocs.length > 0 && (
              <>
                <li className="shared-section-divider">Shared with me</li>
                {Array.from(sharedByOwner.values()).flatMap((group) =>
                  group.docs.map((doc) => (
                    <li key={doc.id} className={`doc-item${doc.id === activeId ? ' active' : ''}`}
                      style={{ paddingLeft: '10px' }}
                      onClick={() => onSelect(doc.id)}
                    >
                      {group.avatar
                        ? <img className="doc-owner-avatar" src={group.avatar} alt="" title={`Shared by ${group.name}`} />
                        : <span className="doc-owner-initial" title={`Shared by ${group.name}`}>{(group.name ?? '?').slice(0, 1).toUpperCase()}</span>
                      }
                      <span className="doc-title">{doc.title || 'Untitled'}</span>
                      <span className={`doc-perm-badge doc-perm-badge--${doc.effectivePermission}`}>
                        {doc.effectivePermission === 'edit' ? 'Edit' : 'Comment'}
                      </span>
                    </li>
                  ))
                )}
              </>
            )}
          </>
        )}
      </ul>
    </aside>
  );
}
