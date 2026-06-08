import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar, type SortMode } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { useAuth } from "../../auth/AuthContext";
import {
  type DocMeta,
  type DohDoc,
  type Folder,
  createDoc,
  deleteDoc,
  getDoc,
  listDocs,
  saveDoc,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveDoc,
} from "../../storage/db";
import "./TasksApp.css";
import "./styles/formatting-selectors.css";

const EXAMPLE_NOTE = `# DohDocs Formatting Guide

A complete tour of every formatting type the editor supports.

## Headings

### Heading 3

#### Heading 4

## Text Styles

Regular paragraph text. **Bold** and *italic* can be applied from the toolbar or with standard keyboard shortcuts.

==Highlighted text== gets a yellow background from the Highlight extension.

> Blockquotes set off a callout or pulled quote — great for notes-within-notes.

## Priority Marks

Apply these with the **F** button in the toolbar:

<span data-fmt="p1" class="fmt-p1">P1 — red background, highest priority</span>

<span data-fmt="p2" class="fmt-p2">P2 — yellow background, medium priority</span>

<span data-fmt="p3" class="fmt-p3">P3 — blue background, lower priority</span>

<span data-fmt="comment" class="fmt-comment">This is a comment — italic with quotation marks</span>

## Lists

### Bullet List

- First item
- Second item
- Third item with **bold** text inside

### Numbered List

1. Step one
2. Step two
3. Step three

### Task List

- [ ] Unchecked task
- [x] Completed task
- [ ] Another open task

### Nested List (parent items auto-bold)

- Design
  - Create wireframes
  - Review with team
- Development
  - Implement feature
  - Write tests
`;

function deriveTitle(markdown: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/^#+\s*/, "").trim();
    if (line) return line.slice(0, 80);
  }
  return "Untitled";
}

export function TasksApp() {
  const { state } = useAuth();
  const ownerId = state.status === "authenticated" ? state.profile.id : null;

  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [active, setActive] = useState<DohDoc | null>(null);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sort, setSort] = useState<SortMode>(
    () => (localStorage.getItem("dohdash-tasks-sort") as SortMode) || "edited"
  );
  const initialized = useRef(false);
  const loadSeq = useRef(0);

  const loadDocs = useCallback(async (q = search) => {
    const seq = ++loadSeq.current;
    const list = await listDocs(q);
    if (seq === loadSeq.current) setDocs(list);
  }, [search]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      if (!localStorage.getItem("dohdash-tasks-example-seeded")) {
        localStorage.setItem("dohdash-tasks-example-seeded", "1");
        const doc = await createDoc(null, ownerId);
        const seeded = { ...doc, title: deriveTitle(EXAMPLE_NOTE), markdown: EXAMPLE_NOTE };
        await saveDoc(seeded);
      }

      const [list, folderList] = await Promise.all([listDocs(), listFolders()]);
      setDocs(list);
      setFolders(folderList);
      if (list.length) setActive((await getDoc(list[0].id)) ?? null);
    })();
  // ownerId is stable for the lifetime of a session; exclude to avoid re-seeding
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    const t = setTimeout(() => void loadDocs(search), 250);
    return () => clearTimeout(t);
  }, [search, loadDocs]);

  useEffect(() => {
    localStorage.setItem("dohdash-tasks-sort", sort);
  }, [sort]);

  const sortedDocs = useMemo(() => {
    const list = [...docs];
    if (sort === "name") {
      list.sort((a, b) => (a.title || "Untitled").localeCompare(b.title || "Untitled", undefined, { sensitivity: "base" }));
    } else {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return list;
  }, [docs, sort]);

  async function handleSelect(id: string) {
    setActive((await getDoc(id)) ?? null);
    setSidebarOpen(false);
  }

  async function handleCreateInFolder(folderId: string | null) {
    const doc = await createDoc(folderId, ownerId);
    setActive(doc);
    await loadDocs();
  }

  async function handleCreateFolder(name: string, parentId: string | null) {
    await createFolder(name, parentId, ownerId);
    setFolders(await listFolders());
  }

  async function handleRenameFolder(id: string, name: string) {
    await renameFolder(id, name);
    setFolders(await listFolders());
  }

  async function handleDeleteFolder(id: string) {
    await deleteFolder(id);
    setFolders(await listFolders());
    await loadDocs();
  }

  async function handleMoveDoc(docId: string, folderId: string | null) {
    await moveDoc(docId, folderId);
    await loadDocs();
  }

  async function handleDelete(id: string) {
    await deleteDoc(id);
    const list = await listDocs(search);
    loadSeq.current++;
    setDocs(list);
    if (active?.id === id) {
      setActive(list.length ? (await getDoc(list[0].id)) ?? null : null);
    }
  }

  const handleChange = useCallback(
    async (markdown: string) => {
      if (!active) return;
      const updated: DohDoc = {
        ...active,
        markdown,
        title: deriveTitle(markdown),
        updatedAt: Date.now(),
      };
      await saveDoc(updated);
      setActive((cur) => (cur && cur.id === updated.id ? { ...cur, ...updated } : cur));
      const list = await listDocs(search);
      loadSeq.current++;
      setDocs(list);
    },
    [active, search]
  );

  return (
    <div className="tasks-app">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        docs={sortedDocs}
        folders={folders}
        activeId={active?.id ?? null}
        search={search}
        onSearch={setSearch}
        sort={sort}
        onSort={setSort}
        onSelect={handleSelect}
        onCreateInFolder={handleCreateInFolder}
        onDelete={handleDelete}
        onMoveDoc={handleMoveDoc}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main">
        {active ? (
          <Editor key={active.id} note={active} onChange={handleChange} onOpenSidebar={() => setSidebarOpen(true)} />
        ) : (
          <div className="empty-main">Create a document to get started.</div>
        )}
      </main>
    </div>
  );
}
