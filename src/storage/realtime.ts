// Realtime layer for DohDocs collaboration — the only file besides db.ts
// that touches the supabase client (it shares db.ts's exported client).
// Components import typed subscribe helpers; they never touch supabase
// directly.
//
// Two channel kinds, both plain broadcast (no postgres_changes publication
// needed — every write already flows through this app, so writers notify):
//
//   doc:<id>     per-document. Presence tracks who has the doc open (with an
//                `editing` flag); "doc-updated" broadcasts carry the saved
//                markdown so other viewers refresh live.
//   docs-list    app-wide. Fires after any notes/folders mutation so every
//                client refreshes its sidebar.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./client";

export interface PresenceIdentity {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface DocPeer extends PresenceIdentity {
  editing: boolean;
}

export interface DocUpdatePayload {
  docId: string;
  markdown: string;
  updatedAt: number;
  senderId: string;
}

export interface DocChannelHandle {
  /** Re-tracks presence with the editing flag (3s-idle reset by the caller). */
  setEditing(editing: boolean): void;
  /** Broadcast live typing (streaming edits before save). */
  broadcastTyping(payload: { markdown: string }): void;
  /** Broadcast a saved update. */
  broadcastUpdate(payload: { markdown: string; updatedAt: number }): void;
  unsubscribe(): void;
}

export function subscribeDocChannel(
  docId: string,
  opts: {
    self: PresenceIdentity;
    onPeers(peers: DocPeer[]): void;
    onDocUpdated(payload: DocUpdatePayload): void;
  },
): DocChannelHandle {
  let editing = false;

  const channel = supabase.channel(`doc:${docId}`, {
    config: { broadcast: { self: false }, presence: { key: opts.self.userId } },
  });

  const track = () => {
    void channel.track({ ...opts.self, editing });
  };

  const emitPeers = () => {
    const state = channel.presenceState<DocPeer>();
    const peers: DocPeer[] = [];
    for (const [key, metas] of Object.entries(state)) {
      // Presence is keyed by userId, so the same user in two tabs is one entry.
      if (key === opts.self.userId || metas.length === 0) continue;
      const meta = metas[metas.length - 1];
      peers.push({ userId: meta.userId, name: meta.name, avatarUrl: meta.avatarUrl, editing: meta.editing });
    }
    opts.onPeers(peers);
  };

  channel
    .on("presence", { event: "sync" }, emitPeers)
    .on("broadcast", { event: "doc-typing" }, ({ payload }) => {
      const typing = payload as { markdown: string; senderId: string };
      if (typing.senderId !== opts.self.userId) opts.onDocUpdated({ ...typing, docId, updatedAt: Date.now() } as DocUpdatePayload);
    })
    .on("broadcast", { event: "doc-updated" }, ({ payload }) => {
      const update = payload as DocUpdatePayload;
      // self:false only suppresses echoes on this channel ref; another tab of
      // the same user is a different ref, so filter by sender too.
      if (update.senderId !== opts.self.userId) opts.onDocUpdated(update);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") track();
    });

  return {
    setEditing(next: boolean) {
      if (next === editing) return;
      editing = next;
      track();
    },
    broadcastTyping({ markdown }) {
      const payload = { markdown, senderId: opts.self.userId };
      void channel.send({ type: "broadcast", event: "doc-typing", payload });
    },
    broadcastUpdate({ markdown, updatedAt }) {
      const payload: DocUpdatePayload = { docId, markdown, updatedAt, senderId: opts.self.userId };
      void channel.send({ type: "broadcast", event: "doc-updated", payload });
    },
    unsubscribe() {
      void supabase.removeChannel(channel);
    },
  };
}

// One shared app-lifetime channel for sidebar refreshes; created lazily by
// whichever side (subscriber or notifier) needs it first.
let listChannel: RealtimeChannel | null = null;
const listListeners = new Set<() => void>();

function ensureListChannel(): RealtimeChannel {
  if (!listChannel) {
    listChannel = supabase.channel("docs-list", { config: { broadcast: { self: false } } });
    listChannel
      .on("broadcast", { event: "changed" }, () => {
        for (const listener of listListeners) listener();
      })
      .subscribe();
  }
  return listChannel;
}

export function subscribeDocsList(onChange: () => void): () => void {
  ensureListChannel();
  let timer: number | undefined;
  // Debounce to coalesce bursts (e.g. several saves in quick succession).
  const listener = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 300);
  };
  listListeners.add(listener);
  return () => {
    window.clearTimeout(timer);
    listListeners.delete(listener);
  };
}

export function notifyDocsListChanged(): void {
  void ensureListChannel().send({ type: "broadcast", event: "changed", payload: {} });
}
