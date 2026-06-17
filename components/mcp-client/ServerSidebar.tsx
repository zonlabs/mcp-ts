"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Filter,
  Search,
  Globe,
  User as UserIcon,
  Loader2,
  ChevronDown,
  ServerCog,
  Hammer,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { McpServer, Category } from "@/types/mcp";
import { ServerListItem } from "./ServerListItem";
import { ServerPlaceholder } from "./ServerPlaceholder";
import { useMcpServersFiltered } from "@/hooks/useMcpServersFiltered";
import { UserSession } from "@/components/providers/AuthProvider";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ServerIcon } from "@/components/common/ServerIcon";
import { cn } from "@/lib/utils";

interface ServerSidebarProps {
  publicServers: McpServer[] | null;
  userServers: McpServer[] | null;
  publicServersCount: number;
  userServersCount: number;
  publicLoading: boolean;
  userLoading: boolean;
  activeServersCount: number;
  selectedServer: McpServer | null;
  onServerSelect: (server: McpServer) => void;
  onAddServer: () => void;
  onEditServer: (server: McpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onRefreshPublic: () => void;
  onRefreshUser: () => void;
  onClose: () => void;
  hasNextPage: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  activeTab: "public" | "user";
  onTabChange: (tab: "public" | "user") => void;
  selectedCategory: string | null;
  onCategoryChange: (category: string) => void;
  session: UserSession | null;
  userSession?: UserSession | null;
  onOpenRemoteMcp: () => void;
  onShowPopular: () => void;
  sidebarOpen?: boolean;
}

export function ServerSidebar({
  publicServers,
  userServers,
  publicServersCount,
  userServersCount,
  publicLoading,
  userLoading,
  activeServersCount,
  selectedServer,
  onServerSelect,
  onAddServer,
  onEditServer,
  onDeleteServer,
  onRefreshPublic,
  onRefreshUser,
  onClose,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
  activeTab,
  onTabChange,
  selectedCategory,
  onCategoryChange,
  session,
  userSession,
  onOpenRemoteMcp,
  onShowPopular,
  sidebarOpen = true,
}: ServerSidebarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const observerTarget = useRef<HTMLDivElement>(null);

  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCategoriesLoading(true);
      try {
        const res = await fetch("/api/categories");
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load categories");
        if (!cancelled) {
          setCategories(Array.isArray(j.categories) ? j.categories : []);
        }
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Use filtered servers hook when search or category is active
  const {
    servers: filteredServers,
    loading: filterLoading,
    hasNextPage: hasFilterNextPage,
    isLoadingMore: isLoadingMoreFiltered,
    isFiltering,
    loadMore: loadMoreFiltered,
  } = useMcpServersFiltered(
    {
      searchQuery,
      categorySlug: selectedCategory || undefined,
      categories,
    },
    10 // 10 items per page for filtered results
  );

  const displayServers = isFiltering
    ? filteredServers
    : activeTab === "public"
      ? publicServers
      : userServers;

  const displayLoading = isFiltering
    ? filterLoading && filteredServers.length === 0
    : activeTab === "public"
      ? publicLoading && (!publicServers || publicServers.length === 0)
      : userLoading;

  const displayHasNextPage = isFiltering ? hasFilterNextPage : hasNextPage;
  const displayIsLoadingMore = isFiltering ? isLoadingMoreFiltered : isLoadingMore;
  const displayLoadMore = isFiltering ? loadMoreFiltered : onLoadMore;

  // Set up IntersectionObserver for infinite scroll
  useEffect(() => {
    if (activeTab !== "public") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          displayHasNextPage &&
          !displayIsLoadingMore
        ) {
          displayLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [
    activeTab,
    displayHasNextPage,
    displayIsLoadingMore,
    displayLoadMore,
  ]);

  const truncateText = (text: string, maxLength = 17) => {
    return text.length > maxLength ? text.slice(0, maxLength) + "…" : text;
  };

  const sidebarVariants = {
    hidden: { x: -320, opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit: { x: -320, opacity: 0 },
  };

  if (!sidebarOpen) {
    return (
      <TooltipProvider>
        <div
          className="border-r border-border flex flex-col bg-background transition-all duration-300 sticky top-16 h-[calc(100vh-4rem)] z-40 w-16 hidden lg:flex"
        >
          {/* Top Header with Expand Button */}
          <div className="p-4 border-b border-border flex flex-col items-center flex-shrink-0">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0 hover:bg-muted cursor-pointer"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className="z-[230]">
                <p className="text-xs">Expand sidebar</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Action Buttons: Manage cog dropdown and Refresh */}
          <div className="p-2 border-b border-border flex flex-col items-center gap-2.5 flex-shrink-0">
            <DropdownMenu>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <span>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 flex items-center justify-center cursor-pointer"
                      >
                        <ServerCog className="h-4.5 w-4.5 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="z-[230]">
                  <p className="text-xs">Manage Remote MCP</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="z-[220] w-56">
                <DropdownMenuItem onClick={onShowPopular} className="cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Popular MCP
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onAddServer} className="cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    Add Remote MCP
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenRemoteMcp} className="cursor-pointer">
                  <span className="flex items-center gap-2 w-full">
                    <Hammer className="h-3.5 w-3.5 text-red-500" />
                    <span className="flex-1">Remote MCP Access</span>
                    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none">NEW</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/gateway")} className="cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    Add Gateway
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    if (activeTab === "public") {
                      onRefreshPublic();
                    } else {
                      onRefreshUser();
                    }
                  }}
                  variant="ghost"
                  size="sm"
                  disabled={activeTab === "public" ? publicLoading : userLoading}
                  className="h-8 w-8 p-0 flex items-center justify-center cursor-pointer"
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4 text-muted-foreground",
                      (activeTab === "public" ? publicLoading : userLoading) ? "animate-spin" : ""
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className="z-[230]">
                <p className="text-xs">Refresh list</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Server List (Only Icons with tooltips) */}
          <div className="flex-1 overflow-y-auto scrollbar-minimal py-3 flex flex-col items-center gap-3 w-full">
            {displayLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-8 rounded-full" />
              ))
            ) : displayServers && displayServers.length > 0 ? (
              displayServers.map((server) => {
                const isSelected = selectedServer?.name === server.name;
                return (
                  <Tooltip key={server.name} delayDuration={100}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onServerSelect(server)}
                        className={cn(
                          "relative h-9 w-9 rounded-lg flex items-center justify-center transition-all hover:bg-muted cursor-pointer",
                          isSelected ? "bg-muted ring-1 ring-red-500/30" : ""
                        )}
                      >
                        {isSelected && (
                          <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-red-500 rounded-r" />
                        )}
                        <ServerIcon
                          serverName={server.name}
                          serverUrl={server.url ?? undefined}
                          size={22}
                          className="rounded-md"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10} className="z-[230]">
                      <p className="font-semibold text-xs">{server.name}</p>
                      {server.description && (
                        <p className="text-[10px] opacity-70 max-w-xs line-clamp-2 mt-0.5">{server.description}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })
            ) : (
              <p className="text-[10px] text-muted-foreground text-center px-1">None</p>
            )}
          </div>
        </div>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <div
        className={cn(
          "border-r border-border flex flex-col bg-background transition-all duration-300",
          // Desktop: sticky in-flow
          "lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:z-40 lg:w-80 lg:inset-auto lg:translate-x-0",
          // Mobile: fixed overlay
          "fixed inset-y-0 left-0 z-[80] w-80 h-full",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="relative h-5 w-5">
              <Image
                src="/technologies/mcp-light.webp"
                alt="MCP"
                width={20}
                height={20}
                className="dark:hidden"
              />
              <Image
                src="/technologies/mcp.webp"
                alt="MCP"
                width={20}
                height={20}
                className="hidden dark:block"
              />
            </div>
            <span className="font-medium text-sm">MCP&apos;s</span>
            {activeServersCount > 0 && (
              <div className="flex items-center gap-1.5 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  {activeServersCount} active
                </span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="flex items-center gap-1"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center justify-between gap-1 flex-1 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <ServerCog className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold">Manage</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[220] w-56">
              <DropdownMenuItem onClick={onShowPopular} className="cursor-pointer">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Popular MCP
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onAddServer} className="cursor-pointer">
                <span className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  Add Remote MCP
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenRemoteMcp} className="cursor-pointer">
                <span className="flex items-center gap-2 w-full">
                  <Hammer className="h-3.5 w-3.5 text-red-500" />
                  <span className="flex-1">Remote MCP Access</span>
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none">NEW</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/gateway")} className="cursor-pointer">
                <span className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  Add Gateway
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            onClick={() => {
              if (activeTab === "public") {
                onRefreshPublic();
              } else {
                onRefreshUser();
              }
            }}
            variant="ghost"
            size="sm"
            disabled={activeTab === "public" ? publicLoading : userLoading}
            className="flex items-center gap-1 flex-1"
          >
            <RefreshCw
              className={`h-4 w-4 ${(activeTab === "public" ? publicLoading : userLoading)
                ? "animate-spin"
                : ""
                }`}
            />
            <span className="text-xs">Refresh</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-1 flex-1"
                disabled={categoriesLoading}
              >
                <Filter className="h-4 w-4" />
                <span className="text-xs max-w-[120px] truncate">
                  {selectedCategory
                    ? truncateText(
                      categories.find((c) => c.slug === selectedCategory)?.name ||
                        selectedCategory,
                      17
                    )
                    : "Filter"}
                </span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="z-[220] w-48">
              <DropdownMenuLabel>Filter by Category</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {categoriesLoading ? (
                <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      onCategoryChange("");
                    }}
                  >
                    All Categories
                  </DropdownMenuItem>
                  {categories.map((node) => (
                    <DropdownMenuItem
                      key={node.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        onCategoryChange(node?.slug || "");
                      }}
                    >
                      {node.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search bar */}
        <div className="mt-2 relative">
          <Input
            type="text"
            placeholder="Search by server name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        <Tabs
          value={activeTab}
          onValueChange={(value) => onTabChange(value as "public" | "user")}
          className="flex-1 flex flex-col min-h-0"
        >
          {/* Tabs Header */}
          <div className="px-4 flex-shrink-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="public"
                className="flex items-center gap-2 text-xs"
              >
                <Globe className="h-3 w-3" />
                Public
                <Badge variant="secondary" className="ml-1 text-xs">
                  {publicServersCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="user"
                className="flex items-center gap-2 text-xs"
              >
                <UserIcon className="h-3 w-3" />
                My Servers
                <Badge variant="secondary" className="ml-1 text-xs">
                  {userServersCount}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide py-4">
            {/* Public Servers */}
            <TabsContent
              value="public"
              className="px-4 pb-6 m-0 flex flex-col gap-1"
            >
              {displayLoading ? (
                [...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="px-3 py-3 border-b border-border last:border-b-0"
                  >
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))
              ) : displayServers && displayServers.length > 0 ? (
                <>
                  {displayServers.map((server) => (
                    <ServerListItem
                      key={server.id}
                      server={server}
                      isSelected={selectedServer?.name === server.name}
                      onClick={() => onServerSelect(server)}
                    />
                  ))}

                  {/* Infinite scroll sentinel */}
                  {displayHasNextPage && (
                    <div ref={observerTarget} className="flex justify-center py-4">
                      {displayIsLoadingMore && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Loading more servers...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Extra spacing at bottom */}
                  <div className="h-16" />
                </>
              ) : (
                <ServerPlaceholder type="no-servers" tab="public" />
              )}
            </TabsContent>

            {/* User Servers */}
            <TabsContent value="user" className="px-4 pb-6 m-0 flex flex-col gap-1">
              {userLoading ? (
                <div className="space-y-0">
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className="px-3 py-3 border-b border-border last:border-b-0"
                    >
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : userServers && userServers.length > 0 ? (
                <>
                  {userServers.map((server) => {
                    const isStaff = userSession?.role === "staff";
                    const myId = session?.user?.id;
                    const canEdit = isStaff || !(server.isPublic && server.owner !== myId);
                    const canDelete = isStaff || !(server.isPublic && server.owner !== myId);

                    return (
                      <ServerListItem
                        key={server.id}
                        server={server}
                        isSelected={selectedServer?.name === server.name}
                        onClick={() => onServerSelect(server)}
                        onEdit={canEdit ? onEditServer : undefined}
                        onDelete={canDelete ? onDeleteServer : undefined}
                        showActions={true}
                      />
                    );
                  })}
                  {/* Extra spacing at bottom */}
                  <div className="h-16" />
                </>
              ) : (
                <ServerPlaceholder type="no-servers" tab="user" />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
    </TooltipProvider>
  );
}

