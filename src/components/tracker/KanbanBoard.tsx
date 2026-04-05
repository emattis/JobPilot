"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TrackerApplication, AppStatus } from "@/types/tracker";
import { COLUMNS } from "./constants";
import { ApplicationCard } from "./ApplicationCard";

// ── Sortable card wrapper ─────────────────────────────────────────────────────

function SortableCard({
  app,
  onSelect,
}: {
  app: TrackerApplication;
  onSelect: (app: TrackerApplication) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: app.id, data: { status: app.status } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ApplicationCard
        app={app}
        onClick={() => onSelect(app)}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  label,
  color,
  bg,
  border,
  apps,
  onSelect,
}: {
  status: AppStatus;
  label: string;
  color: string;
  bg: string;
  border: string;
  apps: TrackerApplication[];
  onSelect: (app: TrackerApplication) => void;
}) {
  return (
    <div className="flex flex-col min-w-[220px] w-[220px] shrink-0">
      {/* Header */}
      <div className={`border-t-2 ${border} rounded-t-md bg-card/50 px-3 py-2 flex items-center justify-between mb-2`}>
        <span className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${color} ${bg}`}>
          {apps.length}
        </span>
      </div>

      {/* Drop zone */}
      <SortableContext items={apps.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <div
          className={`flex flex-col gap-2 flex-1 min-h-[120px] rounded-b-md p-1 transition-colors ${
            apps.length === 0 ? "border border-dashed border-border/30" : ""
          }`}
          data-column={status}
        >
          {apps.map((app) => (
            <SortableCard key={app.id} app={app} onSelect={onSelect} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  applications: TrackerApplication[];
  onStatusChange: (id: string, newStatus: AppStatus) => Promise<void>;
  onSelect: (app: TrackerApplication) => void;
}

export function KanbanBoard({ applications, onStatusChange, onSelect }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const byStatus = useMemo(() => {
    const map = new Map<AppStatus, TrackerApplication[]>();
    for (const col of COLUMNS) map.set(col.status, []);
    for (const app of applications) {
      map.get(app.status)?.push(app);
    }
    return map;
  }, [applications]);

  const activeApp = activeId ? applications.find((a) => a.id === activeId) : null;

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;

    // Determine target status from over.id (could be a card id or column id)
    const overId = over.id as string;
    const overApp = applications.find((a) => a.id === overId);
    const targetStatus: AppStatus | undefined = overApp
      ? overApp.status
      : (overId as AppStatus);

    const draggedApp = applications.find((a) => a.id === (active.id as string));
    if (!draggedApp || !targetStatus || draggedApp.status === targetStatus) return;

    onStatusChange(draggedApp.id, targetStatus);
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    // We handle status change on dragEnd; this is just for visual feedback
    void active;
    void over;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 pt-1 px-1">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            {...col}
            apps={byStatus.get(col.status) ?? []}
            onSelect={onSelect}
          />
        ))}
      </div>

      <DragOverlay>
        {activeApp && (
          <div className="w-[220px] rotate-1 shadow-2xl">
            <ApplicationCard app={activeApp} onClick={() => {}} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
