import { create } from "zustand";
import type { ExecutionLog, Schedule, Workflow, WorkflowDetail } from "@/types/workflows";
import {
  fetchHistoryList as apiFetchHistoryList,
  fetchWorkflowDetail as apiFetchWorkflowDetail,
  fetchWorkflowHistory as apiFetchWorkflowHistory,
  fetchWorkflows as apiFetchWorkflows,
} from "@/lib/workflows.api";

type DialogState = { open: boolean; workflowId: string | null };

interface WorkflowsState {
  // List data
  workflows: Workflow[];
  workflowsLoading: boolean;

  // History (global list view)
  history: ExecutionLog[];
  historyLoading: boolean;
  historyFetched: boolean;

  // Detail cache
  workflowDetails: Record<string, WorkflowDetail>;
  workflowDetailsLoading: Record<string, boolean>;
  workflowDetailsError: Record<string, string | null>;

  // Per-workflow history
  workflowHistory: Record<string, ExecutionLog[]>;
  workflowHistoryLoading: Record<string, boolean>;

  // Dialog state (list page)
  runDialog: DialogState;
  scheduleDialog: DialogState;

  // Actions
  fetchWorkflows: () => Promise<void>;
  fetchHistoryList: (limit?: number) => Promise<void>;
  fetchWorkflowDetail: (id: string, opts?: { force?: boolean }) => Promise<WorkflowDetail | null>;
  fetchWorkflowHistory: (id: string, limit?: number) => Promise<void>;

  updateWorkflowInList: (id: string, patch: Partial<Workflow>) => void;
  updateWorkflowDetail: (id: string, patch: Partial<WorkflowDetail>) => void;
  prependWorkflow: (workflow: Workflow) => void;
  removeWorkflow: (id: string) => void;

  upsertScheduleInDetail: (workflowId: string, schedule: Schedule) => void;
  removeScheduleFromDetail: (workflowId: string, scheduleId: string) => void;

  openRunDialog: (workflowId: string) => void;
  closeRunDialog: () => void;
  openScheduleDialog: (workflowId: string) => Promise<void>;
  closeScheduleDialog: () => void;
  invalidateHistoryCache: () => void;
}

export const useWorkflowsStore = create<WorkflowsState>((set, get) => ({
  workflows: [],
  workflowsLoading: false,

  history: [],
  historyLoading: false,
  historyFetched: false,

  workflowDetails: {},
  workflowDetailsLoading: {},
  workflowDetailsError: {},

  workflowHistory: {},
  workflowHistoryLoading: {},

  runDialog: { open: false, workflowId: null },
  scheduleDialog: { open: false, workflowId: null },

  fetchWorkflows: async () => {
    set({ workflowsLoading: true });
    try {
      const res = await apiFetchWorkflows();
      if (res.ok) set({ workflows: res.data });
    } finally {
      set({ workflowsLoading: false });
    }
  },

  fetchHistoryList: async (limit = 50) => {
    const { historyFetched } = get();
    if (historyFetched) return;
    set({ historyLoading: true, historyFetched: true });
    try {
      const res = await apiFetchHistoryList(limit);
      if (res.ok) set({ history: res.data });
    } finally {
      set({ historyLoading: false });
    }
  },

  fetchWorkflowDetail: async (id, opts) => {
    const state = get();
    if (!opts?.force && state.workflowDetails[id]) return state.workflowDetails[id];
    set((s) => ({
      workflowDetailsLoading: { ...s.workflowDetailsLoading, [id]: true },
      workflowDetailsError: { ...s.workflowDetailsError, [id]: null },
    }));
    try {
      const res = await apiFetchWorkflowDetail(id);
      if (!res.ok) {
        set((s) => ({
          workflowDetailsError: { ...s.workflowDetailsError, [id]: res.error },
        }));
        return null;
      }
      set((s) => ({
        workflowDetails: { ...s.workflowDetails, [id]: res.data },
      }));
      return res.data;
    } finally {
      set((s) => ({
        workflowDetailsLoading: { ...s.workflowDetailsLoading, [id]: false },
      }));
    }
  },

  fetchWorkflowHistory: async (id, limit = 20) => {
    set((s) => ({
      workflowHistoryLoading: { ...s.workflowHistoryLoading, [id]: true },
    }));
    try {
      const res = await apiFetchWorkflowHistory(id, limit);
      if (res.ok) {
        set((s) => ({
          workflowHistory: { ...s.workflowHistory, [id]: res.data },
        }));
      }
    } finally {
      set((s) => ({
        workflowHistoryLoading: { ...s.workflowHistoryLoading, [id]: false },
      }));
    }
  },

  updateWorkflowInList: (id, patch) => {
    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));
  },

  updateWorkflowDetail: (id, patch) => {
    const existing = get().workflowDetails[id];
    if (!existing) return;
    set((s) => ({
      workflowDetails: { ...s.workflowDetails, [id]: { ...existing, ...patch } },
    }));
  },

  prependWorkflow: (workflow) => {
    set((s) => ({ workflows: [workflow, ...s.workflows] }));
  },

  removeWorkflow: (id) => {
    set((s) => ({
      workflows: s.workflows.filter((w) => w.id !== id),
    }));
  },

  upsertScheduleInDetail: (workflowId, schedule) => {
    const wf = get().workflowDetails[workflowId];
    if (!wf) return;
    const exists = wf.scheduled_workflows.find((s) => s.id === schedule.id);
    const nextSchedules = exists
      ? wf.scheduled_workflows.map((s) => (s.id === schedule.id ? schedule : s))
      : [...wf.scheduled_workflows, schedule];
    set((s) => ({
      workflowDetails: {
        ...s.workflowDetails,
        [workflowId]: { ...wf, scheduled_workflows: nextSchedules },
      },
    }));
  },

  removeScheduleFromDetail: (workflowId, scheduleId) => {
    const wf = get().workflowDetails[workflowId];
    if (!wf) return;
    set((s) => ({
      workflowDetails: {
        ...s.workflowDetails,
        [workflowId]: {
          ...wf,
          scheduled_workflows: wf.scheduled_workflows.filter((s) => s.id !== scheduleId),
        },
      },
    }));
  },

  openRunDialog: (workflowId) => {
    set({ runDialog: { open: true, workflowId } });
  },
  closeRunDialog: () => set({ runDialog: { open: false, workflowId: null } }),

  openScheduleDialog: async (workflowId) => {
    set({ scheduleDialog: { open: true, workflowId } });
    await get().fetchWorkflowDetail(workflowId);
  },
  closeScheduleDialog: () => set({ scheduleDialog: { open: false, workflowId: null } }),

  invalidateHistoryCache: () => set({ historyFetched: false }),
}));
