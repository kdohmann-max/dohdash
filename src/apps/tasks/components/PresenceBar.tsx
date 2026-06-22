// Avatar stack showing who else has the active document open, with an
// "is editing…" indicator driven by the presence `editing` flag.

import type { DocPeer } from "../../../storage/realtime";
import "./PresenceBar.css";

const MAX_AVATARS = 4;

export function PresenceBar({ peers }: { peers: DocPeer[] }) {
  if (peers.length === 0) return null;

  const editingPeers = peers.filter((peer) => peer.editing);
  const typingLabel =
    editingPeers.length === 1
      ? `${editingPeers[0].name} is typing`
      : editingPeers.length > 1
        ? `${editingPeers.length} people are typing`
        : null;

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
              title={peer.editing ? `${peer.name} (typing)` : peer.name}
            />
          ) : (
            <span
              key={peer.userId}
              className={`presence-avatar presence-avatar--placeholder${editingClass}`}
              title={peer.editing ? `${peer.name} (typing)` : peer.name}
            >
              {peer.name.slice(0, 1).toUpperCase()}
            </span>
          );
        })}
        {peers.length > MAX_AVATARS ? (
          <span className="presence-avatar presence-avatar--placeholder">+{peers.length - MAX_AVATARS}</span>
        ) : null}
      </div>
      {typingLabel ? (
        <span className="presence-editing">
          {typingLabel}
          <span className="presence-typing-dots" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </span>
      ) : null}
    </div>
  );
}
