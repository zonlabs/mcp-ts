'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { McpAppRenderer } from '@/components/chat/McpAppRenderer';

export interface ActiveMcpApp {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status: 'executing' | 'inProgress' | 'complete' | 'idle';
}

interface ActiveMcpAppOverlayProps {
  app: ActiveMcpApp;
  onClose: () => void;
}

export function ActiveMcpAppOverlay({ app, onClose }: ActiveMcpAppOverlayProps) {
  return (
    <div className="flex-1 min-h-0 w-full relative bg-background z-10 flex flex-col items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 left-4 p-2 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition-all duration-200 z-20 flex items-center gap-2 text-sm font-medium cursor-pointer"
        aria-label="Back to chat"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to chat</span>
      </button>
      <div className="w-full h-full p-4">
        <McpAppRenderer
          name={app.name}
          args={app.args}
          result={app.result}
          status={app.status}
        />
      </div>
    </div>
  );
}
