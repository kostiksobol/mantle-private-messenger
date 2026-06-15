import { useMemo, useState } from "react";

import { normalizeAddress } from "@mantle/messenger-core/db";
import { formatTime, initials, shortAddress } from "./format";
import type { ChatWithPreview, KnownUser, SelfProfile } from "./types";

type ChatSidebarProps = {
  selfProfile: SelfProfile;
  ownerAddress?: string;
  chatName: string;
  selectedChatId: string;
  chatsWithPreview: ChatWithPreview[];
  knownUsersByAddress: ReadonlyMap<string, KnownUser>;
  busy: boolean;
  showDebug: boolean;
  onChatNameChange: (value: string) => void;
  onCreateChat: () => Promise<void>;
  onSelectChat: (chatId: string) => void;
  onToggleDebug: () => void;
  onDisconnect: () => void;
};

function userLabel(
  address: string | undefined,
  knownUsersByAddress: ReadonlyMap<string, KnownUser>
) {
  if (!address) {
    return "Unknown";
  }

  const user = knownUsersByAddress.get(normalizeAddress(address));

  return user?.name || user?.login || shortAddress(address);
}

function chatPreviewText(
  item: ChatWithPreview,
  knownUsersByAddress: ReadonlyMap<string, KnownUser>
) {
  const { lastMessage, membersCount } = item;

  if (!lastMessage) {
    return `${membersCount} member${membersCount === 1 ? "" : "s"}`;
  }

  if (lastMessage.event === "ChatCreation") {
    return "Chat created";
  }

  if (lastMessage.event === "Invitation") {
    const author = userLabel(lastMessage.authorAddress, knownUsersByAddress);
    const invited = userLabel(lastMessage.invitedAddress, knownUsersByAddress);

    return `${author} invited ${invited}`;
  }

  return lastMessage.content || "Message";
}

export function ChatSidebar({
  selfProfile,
  ownerAddress,
  chatName,
  selectedChatId,
  chatsWithPreview,
  knownUsersByAddress,
  busy,
  showDebug,
  onChatNameChange,
  onCreateChat,
  onSelectChat,
  onToggleDebug,
  onDisconnect,
}: ChatSidebarProps) {
  const [chatSearch, setChatSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);

  const profileName = selfProfile.name || selfProfile.login;
  const profileLogin = selfProfile.login;
  const profileAddress = ownerAddress ?? "";

  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();

    if (!query) {
      return chatsWithPreview;
    }

    return chatsWithPreview.filter((item) => {
      const preview = chatPreviewText(item, knownUsersByAddress);

      return (
        item.chat.name.toLowerCase().includes(query) ||
        preview.toLowerCase().includes(query)
      );
    });
  }, [chatSearch, chatsWithPreview, knownUsersByAddress]);

  async function createChat() {
    await onCreateChat();
    setShowNewChat(false);
  }

  return (
    <aside className="chatSidebar">
      <header className="sidebarHeader">
        <div className="sidebarIdentity">
          <div className="sidebarTitle">Chats</div>

          <details className="accountStrip">
            <summary className="accountSummary">
              <div className="accountSummaryText">
                <span className="accountLabel">Account</span>
                <strong>{profileName}</strong>
              </div>

              <span className="accountChevron">⌄</span>
            </summary>

            <div className="accountExpanded">
              <div className="accountField">
                <span>Login</span>
                <strong>{profileLogin}</strong>
              </div>

              {profileAddress && (
                <div className="accountField accountAddressField">
                  <span>Address</span>
                  <code title={profileAddress}>{profileAddress}</code>
                </div>
              )}
            </div>
          </details>
        </div>

        <div className="sidebarActions">
          <button
            className={showDebug ? "roundButton active" : "roundButton"}
            title={showDebug ? "Hide dev tools" : "Show dev tools"}
            onClick={onToggleDebug}
          >
            ⚙
          </button>

          <button
            className="roundButton"
            title="Disconnect"
            onClick={onDisconnect}
          >
            ⎋
          </button>
        </div>
      </header>

      <section className="chatToolbar">
        <div className="chatSearchBox">
          <span>⌕</span>
          <input
            placeholder="Search chats"
            value={chatSearch}
            onChange={(event) => setChatSearch(event.target.value)}
          />
        </div>

        <button
          className={showNewChat ? "newChatToggle active" : "newChatToggle"}
          title={showNewChat ? "Close new chat" : "New chat"}
          onClick={() => setShowNewChat((value) => !value)}
        >
          +
        </button>

        {showNewChat && (
          <form
            className="compactNewChatForm"
            onSubmit={(event) => {
              event.preventDefault();
              void createChat();
            }}
          >
            <input
              placeholder="Chat name"
              value={chatName}
              onChange={(event) => onChatNameChange(event.target.value)}
              autoFocus
            />

            <button disabled={busy}>Create</button>
          </form>
        )}
      </section>

      <nav className="chatList">
        {chatsWithPreview.length === 0 ? (
          <div className="emptyState small">
            <strong>No chats yet</strong>
            <span>Create your first encrypted chat.</span>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="emptyState small">
            <strong>No results</strong>
            <span>Try another chat name or message preview.</span>
          </div>
        ) : (
          filteredChats.map((item) => {
            const { chat, lastMessage } = item;
            const preview = chatPreviewText(item, knownUsersByAddress);

            return (
              <button
                key={chat.chatId}
                className={
                  chat.chatId === selectedChatId
                    ? "chatItem active"
                    : "chatItem"
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

                  <div className="chatPreview">{preview}</div>
                </div>
              </button>
            );
          })
        )}
      </nav>
    </aside>
  );
}
