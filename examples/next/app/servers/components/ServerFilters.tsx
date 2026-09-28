"use client";

import * as React from "react";
import { Search, Plus, Filter, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ServerFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  filterEnabled: "all" | "true" | "false";
  onFilterEnabledChange: (value: "all" | "true" | "false") => void;
  userId: string;
  onUserIdChange: (userId: string) => void;
  totalServers: number;
  onOpenCreate: () => void;
}

export function ServerFilters({
  search,
  onSearchChange,
  filterEnabled,
  onFilterEnabledChange,
  userId,
  onUserIdChange,
  totalServers,
  onOpenCreate,
}: ServerFiltersProps) {
  const [editingUserId, setEditingUserId] = React.useState(userId);

  const handleApplyUserId = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUserId.trim()) {
      onUserIdChange(editingUserId.trim());
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      {/* Left side: Search & Status Pills */}
      <div className="flex items-center gap-2 flex-1">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search servers by name, URL, or metadata..."
            className="pl-8 pr-8 text-xs h-9 bg-card"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg border border-border/50 shrink-0">
          {(
            [
              { id: "all", label: `All (${totalServers})` },
              { id: "true", label: "Active" },
              { id: "false", label: "Disabled" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFilterEnabledChange(tab.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                filterEnabled === tab.id
                  ? "bg-card text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right side: User ID & Add Server Button */}
      <div className="flex items-center gap-2 shrink-0">
        <form onSubmit={handleApplyUserId} className="flex items-center gap-1.5">
          <div className="relative">
            <User className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={editingUserId}
              onChange={(e) => setEditingUserId(e.target.value)}
              onBlur={handleApplyUserId}
              placeholder="User ID"
              className="text-xs h-9 pl-7 w-32 font-mono bg-card"
              title="Change User Context"
            />
          </div>
        </form>

        <Button
          size="sm"
          onClick={onOpenCreate}
          className="text-xs h-9 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Add MCP Server
        </Button>
      </div>
    </div>
  );
}
