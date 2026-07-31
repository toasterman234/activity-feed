"use client";

import { ArrowUpIcon } from "lucide-react";
import { ThreadChatTranscript } from "./ThreadChatTranscript";
import { type MessageRow, type ActivityEventRow } from "./shapes";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui";

export type ThreadConversationTabProps = {
  threadMsg: MessageRow;
  replies: MessageRow[];
  replyBody: string;
  onReplyBodyChange: (value: string) => void;
  onSubmitReply: () => void;
  mentionOptions: Array<{ handle: string; label: string; hint?: string }>;
  sending: boolean;
  isArchived: boolean;
  runEvents: ActivityEventRow[];
  activityRunning: boolean;
};

export function ThreadConversationTab({
  threadMsg,
  replies,
  replyBody,
  onReplyBodyChange,
  onSubmitReply,
  sending,
  isArchived,
  runEvents,
  activityRunning,
}: ThreadConversationTabProps) {
  return (
    <ThreadChatTranscript
      rootMessage={{
        id: threadMsg.id,
        author: threadMsg.author,
        body: threadMsg.body,
        createdAt: threadMsg.created_at,
      }}
      replies={replies.map((reply) => ({
        id: reply.id,
        author: reply.author,
        body: reply.body,
        createdAt: reply.created_at,
      }))}
      runEvents={runEvents}
      activityRunning={activityRunning}
      description="Live thread chat"
      emptyLabel="No conversation yet"
      emptyDescription="Type a reply below to continue the thread."
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitReply();
          }}
          className="w-full"
        >
          <InputGroup>
            <input
              value={replyBody}
              onChange={(e) => onReplyBodyChange(e.target.value)}
              placeholder={isArchived ? "Thread is archived — replies disabled" : "Reply to this thread…"}
              disabled={sending || isArchived}
              className="h-14 w-full bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <InputGroupAddon align="block-end" className="pt-0">
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                disabled={!replyBody.trim() || sending || isArchived}
                className="ml-auto"
                aria-label="Send reply"
              >
                <ArrowUpIcon />
                <span className="sr-only">Send</span>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      }
    />
  );
}
