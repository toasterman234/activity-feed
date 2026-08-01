"use client";

import { useMemo, type ReactNode } from "react";
import { MessageCircleDashedIcon } from "lucide-react";
import {
  Bubble,
  BubbleContent,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@/components/ui";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import { AgentTraceCard } from "./AgentTraceCard";
import { MessageBody } from "./MentionInput";
import { relativeTime, type ActivityEventRow } from "./shapes";

export type ThreadChatMessage = {
  id: string;
  author: string | null;
  body: string;
  createdAt: string;
};

type Props = {
  rootMessage: ThreadChatMessage | null;
  replies: ThreadChatMessage[];
  runEvents?: ActivityEventRow[];
  activityRunning?: boolean;
  emptyLabel?: string;
  emptyDescription?: string;
  footer?: ReactNode;
  title?: string;
  description?: string;
  className?: string;
};

const AVATAR_COLORS = [
  "bg-blue-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-purple-500 text-white",
  "bg-rose-500 text-white",
  "bg-cyan-500 text-white",
  "bg-indigo-500 text-white",
  "bg-teal-500 text-white",
];

function displayAuthor(author: string | null | undefined): string {
  return (author || "system").trim() || "system";
}

function authorInitials(author: string | null | undefined): string {
  return displayAuthor(author).slice(0, 2).toUpperCase();
}

function authorColor(author: string | null | undefined): string {
  const text = displayAuthor(author);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function isYou(author: string | null | undefined): boolean {
  const normalized = displayAuthor(author).toLowerCase();
  return normalized === "you" || normalized === "ben";
}

export function ThreadChatTranscript({
  rootMessage,
  replies,
  runEvents = [],
  activityRunning = false,
  emptyLabel = "No conversation yet",
  emptyDescription = "Type below to start the thread.",
  footer,
  title = "Conversation",
  description = "Live thread chat",
  className = "",
}: Props) {
  const orderedMessages = useMemo(() => {
    const base = rootMessage ? [rootMessage] : [];
    const sortedReplies = [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return [...base, ...sortedReplies];
  }, [rootMessage, replies]);

  const latestMessage = orderedMessages[orderedMessages.length - 1] ?? null;
  const traceTitle = activityRunning ? "Agent working" : "Reasoning trace";

  const groups = useMemo(() => {
    const next: ThreadChatMessage[][] = [];
    for (const message of orderedMessages) {
      const last = next[next.length - 1];
      if (last && displayAuthor(last[0].author) === displayAuthor(message.author)) {
        last.push(message);
      } else {
        next.push([message]);
      }
    }
    return next;
  }, [orderedMessages]);

  return (
    <MessageScrollerProvider>
      <Card className={`mx-auto w-full gap-0 ${className}`.trim()}>
        <CardHeader className="gap-1 border-b">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          {groups.length === 0 ? (
            <Empty className="min-h-[22rem]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageCircleDashedIcon />
                </EmptyMedia>
                <EmptyTitle>{emptyLabel}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent aria-busy={activityRunning} className="max-h-[min(60vh,42rem)] p-(--card-spacing)">
                  {groups.map((group) => {
                    const first = group[0];
                    const mine = isYou(first.author);
                    const isLastGroup = group[group.length - 1].id === latestMessage?.id;
                    const showTraceHere = isLastGroup && runEvents.length > 0 && !mine;

                    return (
                      <MessageScrollerItem key={group[group.length - 1].id} scrollAnchor={mine}>
                        <MessageGroup>
                          {group.map((message, index) => (
                            <Message key={message.id} align={mine ? "end" : "start"}>
                              <MessageAvatar>
                                {index === 0 && (
                                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${authorColor(message.author)}`}>
                                    {authorInitials(message.author)}
                                  </span>
                                )}
                              </MessageAvatar>
                              <MessageContent>
                                {index === 0 && (
                                  <MessageHeader className={mine ? "justify-end text-zinc-700 dark:text-zinc-300" : "text-zinc-700 dark:text-zinc-300"}>
                                    <span className="text-zinc-950 dark:text-zinc-50">{displayAuthor(message.author)}</span>
                                    <span className="ml-2 font-normal">{relativeTime(message.createdAt)}</span>
                                  </MessageHeader>
                                )}
                                <Bubble align={mine ? "end" : "start"} variant={mine ? "tinted" : "outline"} className={index > 0 ? "mt-0.5" : ""}>
                                  <BubbleContent className="text-zinc-950 dark:text-zinc-50">
                                    <MessageBody body={message.body} className="whitespace-pre-wrap text-zinc-950 dark:text-zinc-50" />
                                  </BubbleContent>
                                </Bubble>
                              </MessageContent>
                            </Message>
                          ))}
                          {showTraceHere && (
                            <div className="ml-10 mt-2">
                              <AgentTraceCard events={runEvents} running={activityRunning} title={traceTitle} />
                            </div>
                          )}
                        </MessageGroup>
                      </MessageScrollerItem>
                    );
                  })}

                  {runEvents.length > 0 && latestMessage && isYou(latestMessage.author) && (
                    <MessageScrollerItem scrollAnchor>
                      <div className="ml-10">
                        <AgentTraceCard events={runEvents} running={activityRunning} title={traceTitle} />
                      </div>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          )}
        </CardContent>
        {footer ? <CardFooter className="flex-col gap-2 border-t bg-background">{footer}</CardFooter> : null}
      </Card>
    </MessageScrollerProvider>
  );
}
