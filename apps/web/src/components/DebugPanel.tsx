import { formatDateTime } from "./format";
import type { ChatMember, KnownUser, LocalChat, LocalMessage, SelfProfile } from "./types";

type DebugPanelProps = {
  selfProfile: SelfProfile;
  activity: string[];
  chats: LocalChat[];
  chatMembers: ChatMember[];
  knownUsers: KnownUser[];
  messages: LocalMessage[];
  onDeleteIndexedDb: () => Promise<void>;
};

export function DebugPanel({
  selfProfile,
  activity,
  chats,
  chatMembers,
  knownUsers,
  messages,
  onDeleteIndexedDb,
}: DebugPanelProps) {
  return (
    <section className="debugPanel">
      <header>
        <div>
          <h2>Debug</h2>
          <p>IndexedDB, sync activity and cursors.</p>
        </div>

        <button
          className="dangerButton"
          onClick={() => {
            void onDeleteIndexedDb();
          }}
        >
          Delete IndexedDB
        </button>
      </header>

      <div className="debugGrid">
        <div>
          <h3>Profile</h3>
          <pre>{JSON.stringify(selfProfile, null, 2)}</pre>
        </div>

        <div>
          <h3>Activity</h3>
          <pre>{activity.join("\n")}</pre>
        </div>

        <div>
          <h3>Chats</h3>
          <pre>{JSON.stringify(chats, null, 2)}</pre>
        </div>

        <div>
          <h3>Members</h3>
          <pre>{JSON.stringify(chatMembers, null, 2)}</pre>
        </div>

        <div>
          <h3>Known users</h3>
          <pre>{JSON.stringify(knownUsers, null, 2)}</pre>
        </div>

        <div>
          <h3>Messages</h3>
          <pre>
            {JSON.stringify(
              messages.map((message) => ({
                ...message,
                time: formatDateTime(message.timestamp),
              })),
              null,
              2
            )}
          </pre>
        </div>
      </div>
    </section>
  );
}
