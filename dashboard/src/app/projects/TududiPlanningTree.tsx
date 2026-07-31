"use client";

import { useMemo, useRef } from "react";
import { hotkeysCoreFeature, syncDataLoaderFeature, dragAndDropFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import type { ItemInstance } from "@headless-tree/core";
import {
  CheckCircle2Icon,
  CircleIcon,
  FolderIcon,
  FolderOpenIcon,
  ListTodoIcon,
} from "lucide-react";
import { Tree, TreeItem, TreeItemLabel } from "@/components/reui/tree";
import { kindBadgeClass } from "@/lib/tududiConventions";
import { Badge, Button, cx } from "@/components/ui";

export type TududiTreeProject = {
  id: number;
  uid: string;
  name: string;
  description?: string | null;
};

export type TududiTreeTask = {
  id: number;
  uid: string;
  name: string;
  status_label?: string;
  note?: string | null;
  kind?: string;
  stage?: string | null;
  path?: string | null;
  outcome?: string | null;
  blocked?: boolean;
};

type TreeNode = {
  name: string;
  children?: string[];
  kind?: "root" | "project" | "group" | "task";
  projectUid?: string;
  taskUid?: string;
  status?: string;
  taskKind?: string;
  blocked?: boolean;
  stage?: string | null;
  path?: string | null;
};

const ROOT_ID = "planning-root";
const INDENT = 16;

function buildItems(opts: {
  projects: TududiTreeProject[];
  selectedProjectUid: string;
  tasks: TududiTreeTask[];
}): Record<string, TreeNode> {
  const { projects, selectedProjectUid, tasks } = opts;
  const items: Record<string, TreeNode> = {
    [ROOT_ID]: {
      name: "Tududi projects",
      kind: "root",
      children: projects.map((p) => `project:${p.uid}`),
    },
  };

  for (const project of projects) {
    const projectId = `project:${project.uid}`;
    const isSelected = project.uid === selectedProjectUid;
    const projectTasks = isSelected ? tasks : [];
    const open = projectTasks.filter((t) => (t.status_label || "") !== "done");
    const done = projectTasks.filter((t) => t.status_label === "done");

    const groupIds: string[] = [];
    if (isSelected) {
      const openId = `group:${project.uid}:open`;
      const doneId = `group:${project.uid}:done`;
      groupIds.push(openId, doneId);

      items[openId] = {
        name: `Open (${open.length})`,
        kind: "group",
        projectUid: project.uid,
        children: open.map((t) => `task:${t.uid}`),
      };
      items[doneId] = {
        name: `Done (${done.length})`,
        kind: "group",
        projectUid: project.uid,
        children: done.map((t) => `task:${t.uid}`),
      };

      for (const task of projectTasks) {
        items[`task:${task.uid}`] = {
          name: task.name,
          kind: "task",
          projectUid: project.uid,
          taskUid: task.uid,
          status: task.status_label,
          taskKind: task.kind,
          blocked: task.blocked,
          stage: task.stage,
          path: task.path,
        };
      }
    }

    items[projectId] = {
      name: project.name,
      kind: "project",
      projectUid: project.uid,
      children: groupIds,
    };
  }

  return items;
}

type Props = {
  projects: TududiTreeProject[];
  selectedProjectUid: string;
  tasks: TududiTreeTask[];
  busy?: boolean;
  onSelectProject: (uid: string) => void;
  onOpenTask?: (uid: string) => void;
  onSetStatus: (uid: string, status: string) => void;
  onReorderTask?: (uid: string, newOrder: number) => void;
};

function TududiPlanningTreeInner({
  projects,
  selectedProjectUid,
  tasks,
  busy,
  onSelectProject,
  onOpenTask,
  onSetStatus,
  onReorderTask,
}: Props) {
  const onSelectProjectRef = useRef(onSelectProject);
  const onOpenTaskRef = useRef(onOpenTask);
  onSelectProjectRef.current = onSelectProject;
  onOpenTaskRef.current = onOpenTask;

  const items = useMemo(
    () => buildItems({ projects, selectedProjectUid, tasks }),
    [projects, selectedProjectUid, tasks],
  );

  const expandedItems = useMemo(() => {
    const next = [ROOT_ID];
    if (selectedProjectUid) {
      next.push(`project:${selectedProjectUid}`);
      next.push(`group:${selectedProjectUid}:open`);
    }
    return next;
  }, [selectedProjectUid]);

  const tree = useTree<TreeNode>({
    initialState: {
      expandedItems,
      selectedItems: selectedProjectUid ? [`project:${selectedProjectUid}`] : [],
    },
    indent: INDENT,
    rootItemId: ROOT_ID,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => (item.getItemData()?.children?.length ?? 0) > 0,
    dataLoader: {
      getItem: (itemId) => items[itemId] || { name: itemId, children: [] },
      getChildren: (itemId) => items[itemId]?.children ?? [],
    },
    onPrimaryAction: (item) => {
      const data = item.getItemData();
      if (data.kind === "project" && data.projectUid) {
        onSelectProject(data.projectUid);
      }
    },
    // Drag-and-drop: only tasks can be dragged; only groups accept drops
    canDrag: (its: ItemInstance<TreeNode>[]) =>
      its.every((i) => i.getItemData().kind === "task"),
    canDrop: (_its: ItemInstance<TreeNode>[], target: { item: ItemInstance<TreeNode> }) =>
      target.item.getItemData().kind === "group",
    onDrop: async (_, target: { item: ItemInstance<TreeNode> }) => {
      if (!onReorderTask) return;
      // After drop, read final children order from target group and persist
      const children = target.item.getChildren?.() ?? [];
      const taskIds: string[] = [];
      for (const child of children) {
        const id = typeof child === "string" ? child : (child as ItemInstance<TreeNode>).getId();
        if (id.startsWith("task:")) taskIds.push(id.replace("task:", ""));
      }
      taskIds.forEach((uid, idx) => {
        onReorderTask(uid, idx + 1);
      });
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature, dragAndDropFeature],
  });

  return (
    <div className="rounded-lg border border-border bg-card/50">
      <Tree
        indent={INDENT}
        tree={tree}
        toggleIconType="chevron"
        className="relative p-1 before:absolute before:inset-0 before:-ms-1 before:bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)))]"
      >
        {tree.getItems().map((item) => {
          const data = item.getItemData();
          const isProject = data.kind === "project";
          const isTask = data.kind === "task";
          const isSelectedProject =
            isProject && data.projectUid === selectedProjectUid;

          return (
            <TreeItem
              key={item.getId()}
              item={item}
              // DnD feature remaps getProps().onClick → onPress; native button ignores onPress.
              // Render as div and handle activation ourselves.
              render={<div />}
              className="cursor-pointer"
            >
              <TreeItemLabel
                className={cx(
                  "before:bg-background relative w-full before:absolute before:inset-x-0 before:-inset-y-0.5 before:-z-10",
                  isSelectedProject && "bg-accent text-accent-foreground",
                  isTask && "cursor-pointer",
                )}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[data-task-action]")) return;
                  if (isTask && data.taskUid) {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenTaskRef.current?.(data.taskUid);
                    return;
                  }
                  if (isProject && data.projectUid) {
                    e.preventDefault();
                    onSelectProjectRef.current(data.projectUid);
                  }
                }}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  {item.isFolder() ? (
                    item.isExpanded() ? (
                      <FolderOpenIcon className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <FolderIcon className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
                    )
                  ) : isTask ? (
                    data.status === "done" ? (
                      <CheckCircle2Icon className="pointer-events-none size-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <CircleIcon className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
                    )
                  ) : (
                    <ListTodoIcon className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
                  )}

                  {data.taskKind && data.taskKind !== "task" ? (
                    <span
                      className={`rounded px-1 py-0.5 text-[9px] font-medium uppercase ${kindBadgeClass(data.taskKind)}`}
                    >
                      {data.taskKind}
                      {data.stage ? `:${data.stage}` : ""}
                      {data.path ? `/${data.path}` : ""}
                    </span>
                  ) : null}
                  {data.blocked ? (
                    <Badge variant="destructive" className="px-1 py-0 text-[9px]">
                      blocked
                    </Badge>
                  ) : null}

                  <span
                    className={cx(
                      "min-w-0 flex-1 truncate text-xs",
                      isTask && data.status === "done" && "text-muted-foreground line-through",
                      isProject && "font-medium",
                    )}
                  >
                    {item.getItemName()}
                  </span>

                  {isTask && data.taskUid ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={busy}
                      data-task-action=""
                      className="shrink-0 select-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (busy) return;
                        onSetStatus(
                          data.taskUid!,
                          data.status === "done" ? "not_started" : "done",
                        );
                      }}
                    >
                      {data.status === "done" ? "Reopen" : "Done"}
                    </Button>
                  ) : null}
                </span>
              </TreeItemLabel>
            </TreeItem>
          );
        })}
      </Tree>
    </div>
  );
}

/** Remount when selection/tasks change so headless-tree picks up new dataLoader maps. */
export function TududiPlanningTree(props: Props) {
  const remountKey = `${props.selectedProjectUid}:${props.tasks
    .map((t) => `${t.uid}:${t.status_label || ""}`)
    .join(",")}:${props.projects.map((p) => p.uid).join(",")}`;
  return <TududiPlanningTreeInner key={remountKey} {...props} />;
}
