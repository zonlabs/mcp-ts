"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useMemo } from "react";
import { costFromUsage, normalizeUsage } from "tokenlens";

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ContextData = {
  maxTokens?: number;
  usedTokens?: number;
  modelId?: string;
  usage?: UsageLike;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  totalTokens?: number;
  percentUsed?: number;
  costUsd?: number;
};

const ContextDataContext = createContext<ContextData | null>(null);

const useContextData = () => {
  const ctx = useContext(ContextDataContext);
  if (!ctx) {
    throw new Error("Context components must be used within Context");
  }
  return ctx;
};

const formatTokens = (value?: number) => {
  if (!value && value !== 0) return "—";
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
};

const formatUsd = (value?: number) => {
  if (!value && value !== 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(value);
};

export type ContextProps = ComponentProps<typeof HoverCard> & {
  maxTokens?: number;
  usedTokens?: number;
  usage?: UsageLike;
  modelId?: string;
};

export const Context = memo(
  ({ maxTokens, usedTokens, usage, modelId, children, ...props }: ContextProps) => {
    const normalized = useMemo(() => (usage ? normalizeUsage(usage as any) : undefined), [usage]);

    const inputTokens = normalized?.inputTokens ?? 0;
    const outputTokens = normalized?.outputTokens ?? 0;
    const reasoningTokens = normalized?.reasoningTokens ?? 0;
    const cachedInputTokens = normalized?.cachedInputTokens ?? 0;
    const totalTokens =
      normalized?.totalTokens ??
      usedTokens ??
      inputTokens + outputTokens + reasoningTokens;
    const used = usedTokens ?? totalTokens ?? 0;
    const percentUsed =
      maxTokens && maxTokens > 0 ? Math.min(100, Math.round((used / maxTokens) * 100)) : undefined;

    const costUsd = useMemo(() => {
      if (!modelId || !usage) return undefined;
      try {
        return costFromUsage({ id: modelId as any, usage });
      } catch {
        return undefined;
      }
    }, [modelId, usage]);

    const value: ContextData = {
      maxTokens,
      usedTokens: used,
      modelId,
      usage,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cachedInputTokens,
      totalTokens,
      percentUsed,
      costUsd,
    };

    return (
      <ContextDataContext.Provider value={value}>
        <HoverCard {...props}>{children}</HoverCard>
      </ContextDataContext.Provider>
    );
  }
);

export type ContextTriggerProps = ComponentProps<typeof Button>;

export const ContextTrigger = memo(
  ({ className, children, ...props }: ContextTriggerProps) => {
    const { percentUsed } = useContextData();
    const pct = percentUsed ?? 0;
    const radius = 8;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - Math.min(pct / 100, 1));

    return (
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 h-7 sm:h-8 rounded-full px-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
            className
          )}
          {...props}
        >
          {children ?? (
            <>
              <div className="relative w-5 h-5 text-muted-foreground">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-muted-foreground/30"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="text-foreground"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${offset}`}
                  />
                </svg>
              </div>
              <span className="text-[11px] font-medium tabular-nums">
                {percentUsed != null ? `${percentUsed}%` : "—"}
              </span>
            </>
          )}
        </div>
      </HoverCardTrigger>
    );
  }
);

export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

export const ContextContent = memo(({ className, ...props }: ContextContentProps) => (
  <HoverCardContent className={cn("w-72 p-4", className)} {...props} />
));

export type ContextContentHeaderProps = ComponentProps<"div">;

export const ContextContentHeader = memo(
  ({ className, children, ...props }: ContextContentHeaderProps) => {
    const { modelId, usedTokens, maxTokens, percentUsed } = useContextData();

    return (
      <div className={cn("flex items-center justify-between", className)} {...props}>
        <div className="space-y-0.5">
          <div className="text-xs font-medium text-foreground">Context</div>
          <div className="text-[11px] text-muted-foreground">
            {modelId ?? "Unknown model"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-foreground">
            {percentUsed != null ? `${percentUsed}%` : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {formatTokens(usedTokens)} / {formatTokens(maxTokens)}
          </div>
        </div>
        {children}
      </div>
    );
  }
);

export type ContextContentBodyProps = ComponentProps<"div">;

export const ContextContentBody = memo(
  ({ className, ...props }: ContextContentBodyProps) => (
    <div className={cn("mt-3 space-y-2 text-xs", className)} {...props} />
  )
);

export type ContextContentFooterProps = ComponentProps<"div">;

export const ContextContentFooter = memo(
  ({ className, children, ...props }: ContextContentFooterProps) => {
    const { costUsd } = useContextData();
    return (
      <div
        className={cn(
          "mt-3 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground",
          className
        )}
        {...props}
      >
        <div className="flex items-center justify-between">
          <span>Total cost</span>
          <span className="font-medium text-foreground">{formatUsd(costUsd)}</span>
        </div>
        {children}
      </div>
    );
  }
);

type UsageRowProps = ComponentProps<"div"> & {
  label: string;
  value?: number;
};

const UsageRow = ({ className, label, value, ...props }: UsageRowProps) => (
  <div className={cn("flex items-center justify-between", className)} {...props}>
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground">{formatTokens(value)}</span>
  </div>
);

export type ContextInputUsageProps = ComponentProps<"div">;
export const ContextInputUsage = memo(({ className, ...props }: ContextInputUsageProps) => {
  const { inputTokens } = useContextData();
  return <UsageRow label="Input tokens" value={inputTokens} className={className} {...props} />;
});

export type ContextOutputUsageProps = ComponentProps<"div">;
export const ContextOutputUsage = memo(({ className, ...props }: ContextOutputUsageProps) => {
  const { outputTokens } = useContextData();
  return <UsageRow label="Output tokens" value={outputTokens} className={className} {...props} />;
});

export type ContextReasoningUsageProps = ComponentProps<"div">;
export const ContextReasoningUsage = memo(({ className, ...props }: ContextReasoningUsageProps) => {
  const { reasoningTokens } = useContextData();
  return <UsageRow label="Reasoning tokens" value={reasoningTokens} className={className} {...props} />;
});

export type ContextCacheUsageProps = ComponentProps<"div">;
export const ContextCacheUsage = memo(({ className, ...props }: ContextCacheUsageProps) => {
  const { cachedInputTokens } = useContextData();
  return <UsageRow label="Cached tokens" value={cachedInputTokens} className={className} {...props} />;
});

Context.displayName = "Context";
ContextTrigger.displayName = "ContextTrigger";
ContextContent.displayName = "ContextContent";
ContextContentHeader.displayName = "ContextContentHeader";
ContextContentBody.displayName = "ContextContentBody";
ContextContentFooter.displayName = "ContextContentFooter";
ContextInputUsage.displayName = "ContextInputUsage";
ContextOutputUsage.displayName = "ContextOutputUsage";
ContextReasoningUsage.displayName = "ContextReasoningUsage";
ContextCacheUsage.displayName = "ContextCacheUsage";
