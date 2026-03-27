"use client";

import { LlmSettingsPanel } from "@/components/playground/LlmSettingsPanel";

export default function ApiKeysPage() {
  return (
    <div className="px-1 md:px-6 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Manage your LLM provider, model, and credentials
        </p>
      </div>

      <div className="space-y-8 max-w-3xl">
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">LLM Settings</h3>
          <LlmSettingsPanel />
        </section>
      </div>
    </div>
  );
}
