import { normalizeAddress } from "../lib/db";
import { initials, shortAddress } from "./format";
import type { ChatMember, KnownUser, LocalChat } from "./types";

type DetailsPanelProps = {
  selectedChat?: LocalChat;
  inviteTarget: string;
  busy: boolean;
  selectedMembers: ChatMember[];
  knownUsersByAddress: ReadonlyMap<string, KnownUser>;
  selectedMemberAddress: string;
  selectedMember?: KnownUser;
  onInviteTargetChange: (value: string) => void;
  onInvite: () => Promise<void>;
  onSelectMemberAddress: (value: string) => void;
};

export function DetailsPanel({
  selectedChat,
  inviteTarget,
  busy,
  selectedMembers,
  knownUsersByAddress,
  selectedMemberAddress,
  selectedMember,
  onInviteTargetChange,
  onInvite,
  onSelectMemberAddress,
}: DetailsPanelProps) {
  return (
    <aside className="detailsPanel">
      <header className="detailsHeader">
        <h2>Chat info</h2>
        <p>{selectedChat?.name || "No chat selected"}</p>
      </header>

      {selectedChat ? (
        <>
          <section className="inviteBox">
            <label>Invite user</label>

            <div className="inviteRow">
              <input
                placeholder="login or 0x address"
                value={inviteTarget}
                onChange={(event) => onInviteTargetChange(event.target.value)}
              />

              <button
                disabled={busy || !inviteTarget.trim()}
                onClick={() => {
                  void onInvite();
                }}
              >
                Invite
              </button>
            </div>
          </section>

          <section className="membersBox">
            <h3>Members</h3>

            <div className="memberList">
              {selectedMembers.map((member) => {
                const user = knownUsersByAddress.get(
                  normalizeAddress(member.userAddress)
                );

                const name =
                  user?.name || user?.login || shortAddress(member.userAddress);

                const active =
                  normalizeAddress(member.userAddress) ===
                  normalizeAddress(selectedMemberAddress || "");

                return (
                  <button
                    key={`${member.chatId}:${member.userAddress}`}
                    className={active ? "memberItem active" : "memberItem"}
                    onClick={() => onSelectMemberAddress(member.userAddress)}
                  >
                    <div className="avatar memberAvatar">{initials(name)}</div>

                    <div>
                      <div className="memberName">{name}</div>
                      <div className="memberMeta">
                        {shortAddress(member.userAddress)} · cursor{" "}
                        {member.cursor}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="memberDetails">
            <h3>Participant details</h3>

            {selectedMember ? (
              <dl>
                <dt>Login</dt>
                <dd>{selectedMember.login}</dd>

                <dt>Name</dt>
                <dd>{selectedMember.name}</dd>

                <dt>Address</dt>
                <dd>{selectedMember.userAddress}</dd>

                <dt>Contract</dt>
                <dd>{selectedMember.userContract}</dd>

                <dt>Kind</dt>
                <dd>{selectedMember.kind === 0 ? "Human" : "Agent"}</dd>

                <dt>Metadata</dt>
                <dd>{selectedMember.metadataURI || "—"}</dd>
              </dl>
            ) : selectedMemberAddress ? (
              <dl>
                <dt>Address</dt>
                <dd>{selectedMemberAddress}</dd>
              </dl>
            ) : (
              <p className="muted">
                Select a participant to inspect profile data.
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="emptyState">Select a chat to see participants.</div>
      )}
    </aside>
  );
}
