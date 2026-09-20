"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Brain,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Clock,
  Loader2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

interface MemoryItem {
  id: string;
  memory: string;
  created_at?: string;
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Add memory dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newFact, setNewFact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  // Fetch memories
  const fetchMemories = async () => {
    try {
      const res = await fetch("/api/memories");
      if (!res.ok) {
        throw new Error("Failed to load memories");
      }
      const data = await res.json();
      setMemories(Array.isArray(data?.memories) ? data.memories : []);
    } catch (err: any) {
      console.error("[MemoriesPage] fetch error:", err);
      toast.error(err?.message || "Failed to load memories");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchMemories();
  };

  // Add memory handler
  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact: newFact.trim() }),
      });

      if (!res.ok) {
        throw new Error("Failed to save memory");
      }

      toast.success("Memory saved successfully!");
      setNewFact("");
      setAddDialogOpen(false);
      fetchMemories();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save memory");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete single memory handler
  const handleDeleteMemory = async () => {
    if (!deleteTargetId) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/memories?id=${encodeURIComponent(deleteTargetId)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete memory");
      }

      setMemories((prev) => prev.filter((m) => m.id !== deleteTargetId));
      toast.success("Memory removed.");
      setDeleteTargetId(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete memory");
    } finally {
      setIsDeleting(false);
    }
  };

  // Clear all memories handler
  const handleClearAll = async () => {
    setIsClearingAll(true);
    try {
      const res = await fetch("/api/memories?all=true", {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to clear memories");
      }

      setMemories([]);
      toast.success("All memories have been cleared.");
      setClearAllOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to clear memories");
    } finally {
      setIsClearingAll(false);
    }
  };

  // Filter memories by search query
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    const q = searchQuery.toLowerCase();
    return memories.filter((m) => m.memory.toLowerCase().includes(q));
  }, [memories, searchQuery]);

  return (
    <div className="flex-1 h-full overflow-y-auto scrollbar-minimal w-full">
      <div className="w-full max-w-4xl px-6 py-8 pb-20 space-y-6 animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Brain className="size-5 text-primary" />
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                Memory
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              LinkOS remembers key details and preferences from your conversations so you don't have to repeat yourself.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              className="h-8 gap-1.5 text-xs cursor-pointer"
            >
              <Plus className="size-3.5" />
              Add Memory
            </Button>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-8 text-xs bg-card/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {memories.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setClearAllOpen(true)}
              className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
            >
              <Trash2 className="size-3.5 mr-1" />
              Clear All ({memories.length})
            </Button>
          )}
        </div>

        {/* Memories Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading memories...</p>
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-border rounded-lg bg-card/30">
            <div className="p-3 rounded-full bg-primary/10 text-primary mb-3">
              <Sparkles className="size-6" />
            </div>
            <h3 className="text-sm font-medium text-foreground">
              {searchQuery ? "No matching memories found" : "No memories saved yet"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
              {searchQuery
                ? `No memories matched "${searchQuery}". Try a different keyword.`
                : "LinkOS automatically remembers key details, preferences, and important context from your conversations so you don't have to repeat yourself."}
            </p>
            {searchQuery ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="h-8 text-xs cursor-pointer"
              >
                Clear Search
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddDialogOpen(true)}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <Plus className="size-3.5" />
                Add Your First Memory
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[11px] font-medium text-muted-foreground">
              Saved Memories ({filteredMemories.length})
            </div>

            <div className="grid gap-2">
              {filteredMemories.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 rounded-md border border-border/80 bg-card hover:border-border transition-colors group"
                >
                  <div className="space-y-1 pr-4 flex-1">
                    <p className="text-xs text-foreground leading-relaxed font-normal">
                      {item.memory}
                    </p>

                    {item.created_at && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                        <Clock className="size-2.5" />
                        <span>
                          {new Date(item.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTargetId(item.id)}
                    className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer shrink-0"
                    title="Forget this memory"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Memory Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAddMemory}>
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="size-4 text-primary" />
                Add a Memory
              </DialogTitle>
              <DialogDescription className="text-xs">
                Save a preference, background detail, or instruction for LinkOS to remember in future conversations.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <div className="space-y-1.5">
                <Label htmlFor="fact" className="text-xs font-medium">
                  What should LinkOS remember?
                </Label>
                <Textarea
                  id="fact"
                  placeholder="e.g. I prefer clear, concise answers with step-by-step code examples."
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  className="min-h-[100px] text-xs resize-none"
                  required
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddDialogOpen(false)}
                className="h-8 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || !newFact.trim()}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Save Memory
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Single Memory Alert */}
      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              Forget this memory?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              LinkOS will remove this detail from memory. It will no longer be recalled in future conversations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMemory}
              disabled={isDeleting}
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {isDeleting ? "Removing..." : "Forget"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear All Memories Alert */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              Clear all saved memories?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will permanently delete all {memories.length} saved memories. LinkOS will start with a fresh slate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              disabled={isClearingAll}
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {isClearingAll ? "Clearing..." : "Clear All Memories"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
