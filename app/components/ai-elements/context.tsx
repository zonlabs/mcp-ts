"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { createContext, memo, useContext, useMemo } from "react";
import { getModels } from "@tokenlens/models";
import { getContext, getTokenCosts } from "@tokenlens/helpers/context";

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  promptTokensDetails?: {
    cachedTokens?: number;
  };
  cache_read_input_tokens?: number;
  cache_read_tokens?: number;
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

const MODEL_CATALOG = getModels();

const useContextData = () => {
  const ctx = useContext(ContextDataContext);
  if (!ctx) {
    throw new Error("Context components must be used within Context");
  }
  return ctx;
};

const formatTokens = (value?: number) => {
  if (!value && value !== 0) return "--";
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
};

const formatUsd = (value?: number) => {
  if (!value && value !== 0) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(value);
};

const pickNumber = (...values: Array<number | undefined>) => {
  for (const value of values) {
    if (typeof value === "number") return value;
  }
  return undefined;
};

function resolveModelCandidates(rawId?: string): string[] {
  if (!rawId) return [];
  const candidates: string[] = [rawId];
  const withoutProviderPrefix = rawId.replace(/^(openrouter|google|openai|anthropic):/, "");
  if (withoutProviderPrefix !== rawId) {
    candidates.push(withoutProviderPrefix);
  }
  if (withoutProviderPrefix.includes("/")) {
    const [vendor, model] = withoutProviderPrefix.split("/");
    candidates.push(`${vendor}:${model}`);
    candidates.push(model);
  }
  return candidates;
}

export type ContextProps = ComponentProps<typeof HoverCard> & {
  maxTokens?: number;
  usedTokens?: number;
  usage?: UsageLike;
  modelId?: string;
};

export const Context = memo(
  ({ maxTokens, usedTokens, usage, modelId, children, ...props }: ContextProps) => {
    const inputTokens = useMemo(
      () =>
        usage
          ? pickNumber(
              usage.inputTokens,
              usage.input_tokens,
              usage.prompt_tokens,
              (usage as any).promptTokens
            )
          : undefined,
      [usage]
    );

    const outputTokens = useMemo(
      () =>
        usage
          ? pickNumber(
              usage.outputTokens,
              usage.output_tokens,
              usage.completion_tokens,
              (usage as any).completionTokens
            )
          : undefined,
      [usage]
    );

    const reasoningTokens = useMemo(
      () => (usage ? pickNumber(usage.reasoningTokens, usage.reasoning_tokens) : undefined),
      [usage]
    );

    const cachedInputTokens = useMemo(
      () =>
        usage
          ? pickNumber(
              usage.cachedInputTokens,
              usage.cache_read_input_tokens,
              usage.cache_read_tokens,
              usage.prompt_tokens_details?.cached_tokens,
              usage.promptTokensDetails?.cachedTokens
            )
          : undefined,
      [usage]
    );

    const totalTokens = useMemo(() => {
      if (!usage) return usedTokens ?? undefined;
      const providedTotal = pickNumber(usage.totalTokens, usage.total_tokens, (usage as any).totalTokens);
      if (typeof providedTotal === "number") return providedTotal;
      if (inputTokens != null || outputTokens != null || reasoningTokens != null) {
        return (inputTokens ?? 0) + (outputTokens ?? 0) + (reasoningTokens ?? 0);
      }
      return usedTokens ?? undefined;
    }, [usage, usedTokens, inputTokens, outputTokens, reasoningTokens]);

    const derivedMax = useMemo(() => {
      if (maxTokens && maxTokens > 0) return maxTokens;
      if (!modelId) return undefined;

      const candidates = resolveModelCandidates(modelId);
      for (const candidate of candidates) {
        try {
          const caps = getContext({ modelId: candidate, providers: MODEL_CATALOG });
          const total = caps.maxTotal ?? caps.totalMax ?? caps.combinedMax ?? caps.maxInput ?? caps.inputMax;
          if (total) return total;
        } catch {}
      }

      return undefined;
    }, [maxTokens, modelId]);

    const used = usedTokens ?? totalTokens ?? 0;
    const percentUsed =
      derivedMax && derivedMax > 0 ? Math.min(100, Math.round((used / derivedMax) * 100)) : undefined;

    const costUsd = useMemo(() => {
      if (!modelId || !usage) return undefined;
      const candidates = resolveModelCandidates(modelId);
      for (const candidate of candidates) {
        try {
          const costs = getTokenCosts({ modelId: candidate, usage, providers: MODEL_CATALOG });
          if (costs?.totalUSD != null) return costs.totalUSD;
        } catch {}
      }
      return undefined;
    }, [modelId, usage]);

    const value: ContextData = {
      maxTokens: derivedMax,
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

export type ContextTriggerProps = ComponentProps<"button">;

export const ContextTrigger = memo(
  ({ className, children, ...props }: ContextTriggerProps) => {
    const { percentUsed } = useContextData();
    const pct = percentUsed ?? 0;
    const radius = 8;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - Math.min(pct / 100, 1));

    return (
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 h-7 sm:h-8 rounded-sm px-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer border border-border/60",
            className
          )}
          {...props}
        >
          {children ?? (
            <>
              <div className="relative w-4 h-4 text-muted-foreground flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-muted-foreground/20"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="text-foreground transition-all duration-300"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${offset}`}
                  />
                </svg>
              </div>
              <span className="text-[11px] font-mono tabular-nums font-medium text-foreground">
                {percentUsed != null ? `${percentUsed}%` : "--"}
              </span>
            </>
          )}
        </button>
      </HoverCardTrigger>
    );
  }
);

export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

export const ContextContent = memo(({ className, ...props }: ContextContentProps) => (
  <HoverCardContent
    className={cn(
      "w-72 p-3.5 rounded-md border border-hairline bg-popover text-popover-foreground shadow-xl",
      className
    )}
    {...props}
  />
));

export type ContextContentHeaderProps = ComponentProps<"div">;

export const ContextContentHeader = memo(
  ({ className, children, ...props }: ContextContentHeaderProps) => {
    const { modelId, usedTokens, maxTokens, percentUsed } = useContextData();
    const displayModel = modelId ? modelId.replace(/^openrouter:/, "") : "Unknown model";

    return (
      <div className={cn("flex items-center justify-between pb-2.5 border-b border-hairline/60", className)} {...props}>
        <div className="space-y-0.5 min-w-0 pr-2">
          <div className="text-xs font-semibold text-foreground tracking-tight">Context Window</div>
          <div className="text-[11px] font-mono text-muted-foreground truncate" title={displayModel}>
            {displayModel}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-mono font-semibold text-foreground tabular-nums">
            {percentUsed != null ? `${percentUsed}%` : "--"}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground tabular-nums">
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
    <div className={cn("mt-2.5 space-y-1.5 text-xs font-mono", className)} {...props} />
  )
);

export type ContextContentFooterProps = ComponentProps<"div">;

export const ContextContentFooter = memo(
  ({ className, children, ...props }: ContextContentFooterProps) => {
    const { costUsd } = useContextData();
    if (costUsd == null) return null;
    return (
      <div
        className={cn(
          "mt-2.5 rounded-sm border border-hairline/60 bg-canvas px-2.5 py-1.5 text-[11px] text-muted-foreground",
          className
        )}
        {...props}
      >
        <div className="flex items-center justify-between font-mono">
          <span className="font-sans text-muted-foreground">Estimated Cost</span>
          <span className="font-medium text-foreground tabular-nums">{formatUsd(costUsd)}</span>
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
  <div className={cn("flex items-center justify-between py-0.5", className)} {...props}>
    <span className="text-xs font-sans text-muted-foreground">{label}</span>
    <span className="text-[11px] font-mono font-medium text-foreground tabular-nums">{formatTokens(value)}</span>
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
