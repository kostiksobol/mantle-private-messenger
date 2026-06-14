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

export function ConversationPanel({
  selectedChat,
  selectedMembers,
  selectedMessages,
  knownUsersByAddress,
  ownerAddress,
  appChainName,
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

            <div className="networkBadge">{appChainName}</div>
          </header>

          <div ref={messageScrollerRef} className="messageScroller">
            {selectedMessages.length === 0 ? (
              <div className="emptyConversation">
                <span>No visible messages yet.</span>
              </div>
            ) : (
              selectedMessages.map((message) => {
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

                const key =
                  message.id ??
                  `${message.authorUserContract}:${message.sourceMessageIndex}`;

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
