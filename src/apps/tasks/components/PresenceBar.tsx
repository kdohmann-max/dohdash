// Avatar stack showing who else has the active document open, with an
// "is editing…" indicator driven by the presence `editing` flag.

import type { DocPeer } from "../../../storage/realtime";
import "./PresenceBar.css";

const MAX_AVATARS = 4;

export function PresenceBar({ peers }: { peers: DocPeer[] }) {
  if (peers.length === 0) return null;

  const editingPeer = peers.find((peer) => peer.editing);

  return (
    <div className="presence-bar">
      <div className="presence-avatars">
        {peers.slice(0, MAX_AVATARS).map((peer) => {
          const editingClass = peer.editing ? " presence-avatar--editing" : "";
          return peer.avatarUrl ? (
            <img
              key={peer.userId}
              className={`presence-avatar${editingClass}`}
              src={peer.avatarUrl}
              alt={peer.name}
              title={peer.editing ? `${peer.name} (editing)` : peer.name}
            />
          ) : (
            <span
              key={peer.userId}
              className={`presence-avatar presence-avatar--placeholder${editingClass}`}
              title={peer.editing ? `${peer.name} (editing)` : peer.name}
            >
              {peer.name.slice(0, 1).toUpperCase()}
            </span>
          );
        })}
        {peers.length > MAX_AVATARS ? (
          <span className="presence-avatar presence-avatar--placeholder">+{peers.length - MAX_AVATARS}</span>
        ) : null}
      </div>
      {editingPeer ? <span className="presence-editing">{editingPeer.name} is editing…</span> : null}
    </div>
  );
}
