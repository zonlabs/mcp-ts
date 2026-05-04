"use client";

import { LlmSettingsPanel } from "@/components/chat/LlmSettingsPanel";
import { WorkflowEngineTokenSection } from "@/components/settings/WorkflowEngineTokenSection";
import { Separator } from "@/components/ui/separator";

export default function ApiKeysPage() {
  return (
    <div className="px-1 md:px-6 pb-16">
      <div className="mb-6">
        <h1 className="text-3xl font-instrument-serif font-medium mb-1">API Keys</h1>
        <p className="text-[15px] font-instrument-serif tracking-wide text-muted-foreground">
          LLM provider credentials and Workflow Automation Engine access
        </p>
      </div>

      <div className="space-y-8 max-w-3xl">
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">LLM Settings</h3>
          <LlmSettingsPanel />
        </section>

        <Separator />

        <WorkflowEngineTokenSection />
      </div>
    </div>
  );
}
