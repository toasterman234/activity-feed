"use client";

import { useEffect, useMemo, useState } from "react";
import type { ShapeMaterialization } from "@electric-circuits/client";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { getMessageShape, releaseMessageShape, type MessageRow } from "./shapes";

function useOptionalMessageRows(shape: ShapeMaterialization | null): MessageRow[] {
  const coll = shape ? (shape.collection as Collection<MessageRow, string>) : null;
  const { data } = useLiveQuery(
    (q) => {
      if (!coll) return undefined as never;
      return q.from({ x: coll }).select(({ x }) => ({
        id: x.id,
        channel_id: x.channel_id,
        thread_id: x.thread_id,
        author: x.author,
        body: x.body,
        created_at: x.created_at,
      }));
    },
    [coll],
  );
  return (data as MessageRow[]) ?? [];
}

export function useLiveThreadMessages(channelId: string, threadId: string) {
  const [messageShape, setMessageShape] = useState<ShapeMaterialization | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    getMessageShape()
      .then((shape) => {
        if (active) setMessageShape(shape);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      active = false;
      releaseMessageShape();
    };
  }, []);

  const rows = useOptionalMessageRows(messageShape);
  const channelMessages = useMemo(
    () => rows.filter((message) => message.channel_id === channelId),
    [rows, channelId],
  );

  const threadMsg = useMemo(
    () => channelMessages.find((message) => message.id === threadId) ?? null,
    [channelMessages, threadId],
  );

  const replies = useMemo(
    () => channelMessages
      .filter((message) => message.thread_id === threadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [channelMessages, threadId],
  );

  return {
    threadMsg,
    replies,
    loading: !messageShape && !error,
    error,
  } satisfies {
    threadMsg: MessageRow | null;
    replies: MessageRow[];
    loading: boolean;
    error: string | null;
  };
}
