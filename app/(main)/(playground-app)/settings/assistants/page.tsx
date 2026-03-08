"use client";

import { Bot, Clock, CheckCircle2, Star, Calendar, Cpu } from "lucide-react";
import { useAssistants } from "@/hooks/useAssistants";

export default function AssistantsPage() {
  const { assistants, loading } = useAssistants();

  const getAssistantIcon = (type: string) => {
    return <Bot className="w-5 h-5" />;
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "orchestrator":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "specialist":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
      case "custom":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <div className="px-1 md:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold mb-1">Assistants</h1>
          <p className="text-sm text-muted-foreground">
            Manage your AI assistants
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Clock className="w-8 h-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Loading assistants...</p>
            </div>
          </div>
        ) : !assistants || assistants.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No assistants found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assistants.map((assistant) => (
              <div
                key={assistant.id}
                className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 rounded-md border border-border/50 bg-card/40 w-full"
              >
                {/* Assistant Icon */}
                <div className="flex-shrink-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    {getAssistantIcon(assistant.assistantType)}
                  </div>
                </div>

                {/* Assistant Details */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm">{assistant.name}</h3>
                    {assistant.isActive && (
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTypeBadgeColor(assistant.assistantType)}`}>
                      {assistant.assistantType}
                    </span>
                  </div>
                  {assistant.description && (
                    <p className="text-xs text-muted-foreground mb-1.5">
                      {assistant.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {assistant.instructions}
                  </p>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Cpu className="w-3 h-3 text-muted-foreground/70" />
                      <span className="text-muted-foreground/70">Model:</span>
                      <span className="font-mono text-[11px]">
                        {assistant.config?.llm_name || assistant.config?.llm_provider || "Default"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-muted-foreground/70" />
                      <span className="text-muted-foreground/70">Created At:</span>
                      <span>{new Date(assistant.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">
                  {assistant.isActive ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">
                        Active
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
