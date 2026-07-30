"use client";

import { MentionInput, MessageBody, type MentionOption } from "./MentionInput";
import { Card, CardContent, Separator } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime, type MessageRow } from "./shapes";

export type ThreadConversationTabProps = {
  threadMsg: MessageRow;
  replies: MessageRow[];
  replyBody: string;
  onReplyBodyChange: (value: string) => void;
  onSubmitReply: () => void;
  mentionOptions: MentionOption[];
  sending: boolean;
  isArchived: boolean;
};

function ReplyCard({ reply }: { reply: MessageRow }) {
  return (
    <Card size="sm" className="border-border">
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">{reply.author}</span>
          <span className="text-[10px] text-muted-foreground">
            {relativeTime(reply.created_at)}
          </span>
        </div>
        <MessageBody
          body={reply.body}
          className="mt-1 whitespace-pre-wrap text-sm text-foreground leading-relaxed"
        />
      </CardContent>
    </Card>
  );
}

export function ThreadConversationTab({
  threadMsg,
  replies,
  replyBody,
  onReplyBodyChange,
  onSubmitReply,
  mentionOptions,
  sending,
  isArchived,
}: ThreadConversationTabProps) {
  const sortedReplies = [...replies].sort(
    (a, b) => a.created_at.localeCompare(b.created_at),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Thread root message */}
      <Card className="border-border">
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              {threadMsg.author}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {relativeTime(threadMsg.created_at)}
            </span>
          </div>
          <MessageBody
            body={threadMsg.body}
            className="mt-1 whitespace-pre-wrap text-sm leading-relaxed"
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Replies */}
      {sortedReplies.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No replies yet
        </p>
      ) : (
        <div className="flex flex-col gap-2 pl-3 border-l-2 border-muted">
          {sortedReplies.map((reply) => (
            <ReplyCard key={reply.id} reply={reply} />
          ))}
        </div>
      )}

      {/* Compose bar */}
      <div className="sticky bottom-0 -mx-3 -mb-3 border-t border-border bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-3xl gap-2">
          <MentionInput
            value={replyBody}
            onChange={onReplyBodyChange}
            onSubmit={onSubmitReply}
            placeholder={
              isArchived
                ? "Thread is archived — replies disabled"
                : "Reply… use @agent to trigger"
            }
            options={mentionOptions}
            disabled={sending || isArchived}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onSubmitReply}
            disabled={!replyBody.trim() || sending || isArchived}
          >
            {sending ? "…" : "Reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
