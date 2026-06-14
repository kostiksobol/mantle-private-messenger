import { formatTime, initials, shortAddress } from "./format";
import type { ChatWithPreview, SelfProfile } from "./types";

type ChatSidebarProps = {
  selfProfile: SelfProfile;
  ownerAddress?: string;
  chatName: string;
  selectedChatId: string;
  chatsWithPreview: ChatWithPreview[];
  busy: boolean;
  showDebug: boolean;
  onChatNameChange: (value: string) => void;
  onCreateChat: () => Promise<void>;
  onSelectChat: (chatId: string) => void;
  onToggleDebug: () => void;
  onDisconnect: () => void;
};

export function ChatSidebar({
  selfProfile,
  ownerAddress,
  chatName,
  selectedChatId,
  chatsWithPreview,
  busy,
  showDebug,
  onChatNameChange,
  onCreateChat,
  onSelectChat,
  onToggleDebug,
  onDisconnect,
}: ChatSidebarProps) {
  return (
    <aside className="chatSidebar">
      <header className="sidebarHeader">
        <div>
          <div className="sidebarTitle">Chats</div>
          <div className="sidebarSubtitle">
            {selfProfile.login} · {shortAddress(ownerAddress)}
          </div>
        </div>

        <button
          className="roundButton"
          title="Disconnect"
          onClick={onDisconnect}
        >
          ⎋
        </button>
      </header>

      <section className="newChatBox">
        <input
          placeholder="New chat name"
          value={chatName}
          onChange={(event) => onChatNameChange(event.target.value)}
        />

        <button
          disabled={busy}
          onClick={() => {
            void onCreateChat();
          }}
        >
          Create
        </button>
      </section>

      <nav className="chatList">
        {chatsWithPreview.length === 0 ? (
          <div className="emptyState small">
            <strong>No chats yet</strong>
            <span>Create your first encrypted chat.</span>
          </div>
        ) : (
          chatsWithPreview.map(({ chat, lastMessage, membersCount }) => (
            <button
              key={chat.chatId}
              className={
                chat.chatId === selectedChatId ? "chatItem active" : "chatItem"
              }
              onClick={() => onSelectChat(chat.chatId)}
            >
              <div className="avatar">{initials(chat.name)}</div>

              <div className="chatItemBody">
                <div className="chatItemTop">
                  <span>{chat.name}</span>
                  <time>
                    {lastMessage ? formatTime(lastMessage.timestamp) : ""}
                  </time>
                </div>

                <div className="chatPreview">
                  {lastMessage
                    ? lastMessage.content
                    : `${membersCount} member${membersCount === 1 ? "" : "s"}`}
                </div>
              </div>
            </button>
          ))
        )}
      </nav>

      <footer className="sidebarFooter">
        <button className="ghostButton full" onClick={onToggleDebug}>
          {showDebug ? "Hide debug" : "Show debug"}
        </button>
      </footer>
    </aside>
  );
}
