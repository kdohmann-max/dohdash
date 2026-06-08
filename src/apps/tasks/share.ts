// Share/export helpers for the active document.
//
// - exportPdf: opens a print window with the rendered HTML + matching styles and
//   triggers the browser print dialog, where the user can "Save as PDF". This is
//   zero-dependency and preserves the editor's look (small-caps headings, nested
//   emphasis, images, task checkboxes).
// - copyRichText: writes both rich (text/html) and plain (Markdown) flavors to
//   the clipboard so pasting into Word/Gmail keeps formatting.

import type { Editor } from "@tiptap/react";

/** Inline styles applied to the print/export document so it matches the app. */
const PRINT_STYLES = `
  body { font-family: "Comfortaa", system-ui, sans-serif; color: #1f2328; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.4; }
  h1, h2, h3, h4 { font-variant: small-caps; letter-spacing: 0.015em; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
  li:not(li li):has(> ul, > ol) > p,
  li:not(li li):has(> div > ul, > div > ol) > div > p:first-child {
    font-weight: 700; font-variant: small-caps; font-size: 1.3em;
  }
  img { max-width: 350px; width: 100%; height: auto; border-radius: 4px; }
  blockquote { color: #5f6368; font-style: italic; border-left: 3px solid #ddd; margin: 0; padding-left: 12px; }
`;

export function exportPdf(editor: Editor, title: string): void {
  const html = editor.getHTML();
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) {
    alert("Pop-up blocked — allow pop-ups to export to PDF.");
    return;
  }
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      title
    )}</title><style>${PRINT_STYLES}</style></head><body>${html}</body></html>`
  );
  win.document.close();
  win.focus();
  // Give the new document a tick to lay out (and load images) before printing.
  win.onload = () => setTimeout(() => win.print(), 250);
}

export async function copyRichText(editor: Editor): Promise<boolean> {
  const html = editor.getHTML();
  const md = (editor.storage as unknown as {
    markdown: { getMarkdown(): string };
  }).markdown.getMarkdown();
  try {
    if (navigator.clipboard && "write" in navigator.clipboard) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([md], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
    await (navigator.clipboard as Clipboard).writeText(md);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}
