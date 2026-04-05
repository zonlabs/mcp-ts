"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2, Zap, GitFork, Sparkles, Info } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WorkflowCard } from "./WorkflowCard";
import { HistoryList } from "./HistoryList";
import { RunDialog } from "./RunDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { CreateWorkflowDialog } from "./CreateWorkflowDialog";
import type { Workflow, ExecutionLog } from "@/types/workflow";

export function WorkflowsPage() {
  const router = useRouter();

  // Data
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [history, setHistory] = useState<ExecutionLog[]>([]);
  const [wfLoading, setWfLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFetched, setHistoryFetched] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<"workflows" | "history">("workflows");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [runWorkflow, setRunWorkflow] = useState<Workflow | null>(null);
  const [scheduleWorkflow, setScheduleWorkflow] = useState<Workflow | null>(null);

  // ── Fetch workflows ───────────────────────────────────────────────────────
  const fetchWorkflows = useCallback(async () => {
    setWfLoading(true);
    try {
      const res = await fetch("/api/workflows");
      if (res.ok) {
        const data = (await res.json()) as { workflows: Workflow[] };
        setWorkflows(data.workflows ?? []);
      }
    } finally {
      setWfLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // ── Fetch history (lazy – only on first tab switch) ───────────────────────
  const fetchHistory = useCallback(async () => {
    if (historyFetched) return;
    setHistoryLoading(true);
    setHistoryFetched(true);
    try {
      const res = await fetch("/api/workflows/history?limit=50");
      if (res.ok) {
        const data = (await res.json()) as { logs: ExecutionLog[] };
        setHistory(data.logs ?? []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFetched]);

  function handleTabChange(tab: string) {
    setActiveTab(tab as "workflows" | "history");
    if (tab === "history") fetchHistory();
  }

  // ── Workflow actions ──────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    if (res.ok) {
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/workflows/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: isActive }),
    });
    if (res.ok) {
      setWorkflows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, is_active: isActive } : w))
      );
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filteredWorkflows = workflows.filter(
    (w) =>
      !search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.description?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredHistory = history.filter(
    (log) =>
      !search ||
      log.workflow?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-6 md:py-10">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automate tasks with AI-powered multi-step workflows
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="shrink-0 gap-2"
          size="sm"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">Create New Workflow</span>
          <span className="sm:hidden">Create</span>
        </Button>
      </div>

      <Alert role="note" className="mb-6 border-border bg-muted/40">
        <Info className="h-4 w-4 text-primary" aria-hidden />
        <AlertTitle>Experimental feature</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Workflows are in early access—scheduling, execution, and AI-generated steps may change or
          break. Treat them as best-effort, not something you should expect to always work.
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <TabsList className="w-fit">
            <TabsTrigger value="workflows" className="gap-2">
              <GitFork className="w-3.5 h-3.5" />
              Workflows
              {workflows.length > 0 && (
                <span className="ml-1 text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">
                  {workflows.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Zap className="w-3.5 h-3.5" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        {/* ── Workflows tab ── */}
        <TabsContent value="workflows" className="mt-0">
          {wfLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading workflows…</span>
            </div>
          ) : filteredWorkflows.length === 0 ? (
            <EmptyWorkflows
              hasSearch={!!search}
              onClear={() => setSearch("")}
              onCreate={() => setCreateOpen(true)}
            />
          ) : (
            <div className="divide-y divide-border">
              {filteredWorkflows.map((wf) => (
                <WorkflowCard
                  key={wf.id}
                  workflow={wf}
                  onRun={() => setRunWorkflow(wf)}
                  onSchedule={() => setScheduleWorkflow(wf)}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                  onView={(id) => router.push(`/workflows/${id}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── History tab ── */}
        <TabsContent value="history" className="mt-0">
          <HistoryList
            logs={filteredHistory}
            loading={historyLoading}
            onViewWorkflow={(wfId) => router.push(`/workflows/${wfId}`)}
          />
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}
      <CreateWorkflowDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(wf) => {
          setWorkflows((prev) => [wf, ...prev]);
          router.push(`/workflows/${wf.id}`);
        }}
      />

      {runWorkflow && (
        <RunDialog
          workflow={runWorkflow}
          open={!!runWorkflow}
          onClose={() => setRunWorkflow(null)}
          onSuccess={() => {
            setHistoryFetched(false);
            if (activeTab === "history") {
              setHistory([]);
              fetchHistory();
            }
          }}
        />
      )}

      {scheduleWorkflow && (
        <ScheduleDialog
          workflow={scheduleWorkflow}
          open={!!scheduleWorkflow}
          onClose={() => setScheduleWorkflow(null)}
          onSuccess={() => {
            setScheduleWorkflow(null);
            fetchWorkflows();
          }}
        />
      )}
    </div>
  );
}

function EmptyWorkflows({
  hasSearch,
  onClear,
  onCreate,
}: {
  hasSearch: boolean;
  onClear: () => void;
  onCreate: () => void;
}) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Search className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No workflows match your search</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={onClear}>
          Clear search
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
        <GitFork className="w-6 h-6 text-primary" />
      </div>
      <p className="text-base font-semibold text-foreground">No workflows yet</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        Create your first workflow to automate tasks with AI and MCP tools
      </p>
      <Button onClick={onCreate} className="mt-5 gap-2">
        <Plus className="w-4 h-4" />
        Create Workflow
      </Button>
    </div>
  );
}
