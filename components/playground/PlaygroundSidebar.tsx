"use client";

import { useState } from "react";
import {
  ChevronRight,
  Settings,
  LogOut,
  SquarePen,
  PanelLeftOpen,
  PanelLeftClose,
  LayoutGrid,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useAuth } from "@/components/providers/AuthProvider";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export const PlaygroundSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { userSession } = useAuth();
  const user = userSession?.user;
  const router = useRouter();
  const pathname = usePathname();

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest';
  const userImage = user?.user_metadata?.avatar_url;

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  const navigateTo = (path: string) => {
    router.push(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden h-14 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-3 flex items-center justify-between">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>
        <button
          onClick={() => router.push("/playground")}
          className="text-sm font-medium text-foreground"
        >
          Anonymous Chat
        </button>
        <button
          onClick={() => router.push("/")}
          className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
          aria-label="Go to home page"
        >
          <Image
            src="/logo.svg"
            alt="Home"
            width={20}
            height={20}
            className="opacity-90"
          />
        </button>
      </div>

      {/* Mobile Drawer */}
      <Dialog open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <DialogContent className="md:hidden p-0 rounded-none max-w-full w-full h-full left-0 top-0 translate-x-0 translate-y-0 border-0" showCloseButton={false}>
          <div className="h-full flex flex-col bg-background">
            <div className="h-14 border-b border-border/60 px-3 flex items-center justify-between">
              <span className="text-sm font-medium">Menu</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-3 py-4 space-y-2">
              <button
                onClick={() => navigateTo('/mcp')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  pathname === "/mcp"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <LayoutGrid className="w-5 h-5" />
                <span>Apps</span>
              </button>
              <button
                onClick={() => navigateTo('/playground')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  pathname === "/playground"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <SquarePen className="w-5 h-5" />
                <span>Anonymous Chat</span>
              </button>
              <button
                onClick={() => navigateTo('/settings')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  pathname.startsWith("/settings")
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </button>
            </div>

            <div className="mt-auto border-t border-border/60 p-3">
              <div className="flex items-center gap-3">
                {userImage ? (
                  <Image
                    src={userImage}
                    alt={userName}
                    width={34}
                    height={34}
                    className="rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-8.5 h-8.5 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{userName}</p>
                  {user?.email && (
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Desktop Sidebar */}
      <div className="relative hidden md:flex">
      <div
        className={cn(
          "transition-all duration-300 ease-in-out flex flex-col bg-background",
          isOpen ? "w-64" : "w-16"
        )}
      >
        {/* Logo Section */}
        <div className={cn(
          "flex items-center pt-3 px-3 pb-3 flex-shrink-0",
          isOpen ? "justify-start" : "justify-center"
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                  "flex items-center rounded-md hover:bg-accent/50 transition-colors cursor-pointer group",
                  isOpen ? "p-2" : "p-2"
                )}
              >
                {isOpen ? (
                  <PanelLeftClose className="w-6 h-6 text-primary group-hover:text-primary/80 transition-colors" />
                ) : (
                  <PanelLeftOpen className="w-6 h-6 text-primary group-hover:text-primary/80 transition-colors" />
                )}
              </button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" sideOffset={8}>
                Toggle Sidebar
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Navigation Buttons */}
        <div className={cn(
          "pb-3 space-y-2 flex-shrink-0",
          isOpen ? "px-2" : "px-1"
        )}>

          {/* Apps Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/mcp')}
                className={cn(
                  "w-full flex items-center py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isOpen ? "gap-3 px-3" : "justify-center px-0",
                  pathname === "/mcp"
                    ? "text-primary hover:text-primary/80"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span className="truncate">Apps</span>}
              </button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" sideOffset={8}>
                Apps
              </TooltipContent>
            )}
          </Tooltip>

          {/* Anonymous Chat Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/playground')}
                className={cn(
                  "w-full flex items-center py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isOpen ? "gap-3 px-3" : "justify-center px-0",
                  pathname === "/playground"
                    ? "text-primary hover:text-primary/80"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <SquarePen className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span className="truncate">Anonymous Chat</span>}
              </button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" sideOffset={8}>
                Anonymous Chat
              </TooltipContent>
            )}
          </Tooltip>

          {/* Settings Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/settings')}
                className={cn(
                  "w-full flex items-center py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isOpen ? "gap-3 px-3" : "justify-center px-0",
                  pathname.startsWith("/settings")
                    ? "text-primary hover:text-primary/80"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span className="truncate">Settings</span>}
              </button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" sideOffset={8}>
                Settings
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Spacer to push profile to bottom */}
        <div className="flex-1"></div>


        {/* Profile Dropdown at Bottom */}
        <div className={cn("p-3 flex-shrink-0")}>
          {!isOpen ? (
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="w-full flex items-center justify-center p-2 rounded-md transition-colors cursor-pointer hover:bg-accent"
                    >
                      {userImage ? (
                        <Image
                          src={userImage}
                          alt={userName}
                          width={32}
                          height={32}
                          className="rounded-full flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                          {userName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Profile
                </TooltipContent>
                <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-fit min-w-[120px] mb-2">
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Tooltip>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-full flex items-center gap-3 p-2 rounded-md transition-colors cursor-pointer hover:bg-accent"
                >
                  {userImage ? (
                    <Image
                      src={userImage}
                      alt={userName}
                      width={40}
                      height={40}
                      className="rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col items-start overflow-hidden flex-1">
                    <span className="text-sm font-medium truncate w-full">{userName}</span>
                    {user?.email && (
                      <span className="text-xs text-muted-foreground truncate w-full">
                        {user.email}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-fit min-w-[120px] mb-2">
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      </div>
    </>
  );
};
