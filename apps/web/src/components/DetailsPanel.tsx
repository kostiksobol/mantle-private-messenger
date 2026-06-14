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

function memberLabel(user: KnownUser | undefined, fallbackAddress: string) {
  return user?.name || user?.login || shortAddress(fallbackAddress);
}

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
    <aside className="detailsPanel cleanDetailsPanel">
      {selectedChat ? (
        <>
          <section className="membersBox primaryMembersBox">
            <div className="sectionTitleRow">
              <div>
                <h3>Members</h3>
                <p>{selectedMembers.length} participants</p>
              </div>
            </div>

            <div className="memberList">
              {selectedMembers.map((member) => {
                const user = knownUsersByAddress.get(
                  normalizeAddress(member.userAddress)
                );

                const name = memberLabel(user, member.userAddress);
                const isCreator =
                  normalizeAddress(member.userAddress) ===
                  normalizeAddress(selectedChat.creatorAddress);

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

                    <div className="memberMain">
                      <div className="memberNameRow">
                        <span className="memberName">{name}</span>
                        {isCreator && (
                          <span className="creatorBadge">Creator</span>
                        )}
                      </div>

                      <div className="memberMeta">
                        {shortAddress(member.userAddress)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <details className="inviteDisclosure">
            <summary>Invite member</summary>

            <section className="inviteBox compactInviteBox">
              <label>Login or address</label>

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
          </details>

          <section className="memberDetails compactMemberDetails">
            <h3>Participant</h3>

            {selectedMember ? (
              <dl>
                <dt>Name</dt>
                <dd>{selectedMember.name || "—"}</dd>

                <dt>Login</dt>
                <dd>{selectedMember.login || "—"}</dd>

                <dt>Address</dt>
                <dd>{shortAddress(selectedMember.userAddress)}</dd>

                <dt>Type</dt>
                <dd>{selectedMember.kind === 0 ? "Human" : "Agent"}</dd>
              </dl>
            ) : selectedMemberAddress ? (
              <dl>
                <dt>Address</dt>
                <dd>{shortAddress(selectedMemberAddress)}</dd>
              </dl>
            ) : (
              <p className="muted">Select a participant to see profile data.</p>
            )}
          </section>
        </>
      ) : (
        <div className="emptyState">Select a chat to see participants.</div>
      )}
    </aside>
  );
}
