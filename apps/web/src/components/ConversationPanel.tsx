import type { RefObject } from "react";

import { normalizeAddress } from "../lib/db";
import { formatTime, shortAddress } from "./format";
import type { ChatMember, KnownUser, LocalChat, LocalMessage } from "./types";

type ConversationPanelProps = {
  selectedChat?: LocalChat;
  selectedMembers: ChatMember[];
  selectedMessages: LocalMessage[];
  knownUsersByAddress: ReadonlyMap<string, KnownUser>;
  ownerAddress?: string;
  appChainName: string;
  messageText: string;
  busy: boolean;
  messageScrollerRef: RefObject<HTMLDivElement | null>;
  onMessageTextChange: (value: string) => void;
  onSendMessage: () => Promise<void>;
};

function userLabel(
  address: string | undefined,
  knownUsersByAddress: ReadonlyMap<string, KnownUser>
) {
  if (!address) {
    return "Unknown user";
  }

  const user = knownUsersByAddress.get(normalizeAddress(address));

  return user?.name || user?.login || shortAddress(address);
}

function systemMessageText(
  message: LocalMessage,
  selectedChat: LocalChat,
  knownUsersByAddress: ReadonlyMap<string, KnownUser>
) {
  if (message.event === "ChatCreation") {
    return message.content || `Chat created: ${selectedChat.name}`;
  }

  if (message.event === "Invitation") {
    const author = userLabel(message.authorAddress, knownUsersByAddress);
    const invited = userLabel(message.invitedAddress, knownUsersByAddress);

    return `${author} invited ${invited}.`;
  }

  return message.content;
}

export function ConversationPanel({
  selectedChat,
  selectedMembers,
  selectedMessages,
  knownUsersByAddress,
  ownerAddress,
  messageText,
  busy,
  messageScrollerRef,
  onMessageTextChange,
  onSendMessage,
}: ConversationPanelProps) {
  return (
    <section className="conversationPanel">
      {selectedChat ? (
        <>
          <header className="conversationHeader">
            <div>
              <h1>{selectedChat.name}</h1>
              <p>
                {selectedMembers.length} members · {selectedMessages.length}{" "}
                messages
              </p>
            </div>

          </header>

          <div ref={messageScrollerRef} className="messageScroller">
            {selectedMessages.length === 0 ? (
              <div className="emptyConversation">
                <span>No visible messages yet.</span>
              </div>
            ) : (
              selectedMessages.map((message) => {
                const key =
                  message.id ??
                  `${message.authorUserContract}:${message.sourceMessageIndex}`;

                const event = message.event ?? "Message";

                if (event !== "Message") {
                  return (
                    <div key={key} className="systemEvent">
                      <span className="systemEventLabel">{event}</span>
                      <span>
                        {systemMessageText(
                          message,
                          selectedChat,
                          knownUsersByAddress
                        )}
                      </span>
                      <time>{formatTime(message.timestamp)}</time>
                    </div>
                  );
                }

                const isMine =
                  ownerAddress !== undefined &&
                  normalizeAddress(message.authorAddress) === ownerAddress;

                const author = knownUsersByAddress.get(
                  normalizeAddress(message.authorAddress)
                );

                const authorName =
                  author?.name ||
                  author?.login ||
                  shortAddress(message.authorAddress);

                return (
                  <article
                    key={key}
                    className={isMine ? "messageBubble mine" : "messageBubble"}
                  >
                    {!isMine && (
                      <div className="messageAuthor">{authorName}</div>
                    )}

                    <div className="messageText">{message.content}</div>

                    <div className="messageMeta">
                      <span>{formatTime(message.timestamp)}</span>
                      <span>#{message.sourceMessageIndex}</span>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void onSendMessage();
            }}
          >
            <textarea
              placeholder="Write a message..."
              value={messageText}
              onChange={(event) => onMessageTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSendMessage();
                }
              }}
            />

            <button disabled={busy || !messageText.trim()}>Send</button>
          </form>
        </>
      ) : (
        <div className="noChatSelected">
          <div className="brandMark">M</div>
          <h1>Select a chat</h1>
          <p>Choose a chat from the left sidebar or create a new one.</p>
        </div>
      )}
    </section>
  );
}
