export interface ModelDefinition {
  id: string;
  name: string;
  description?: string;
  provider: string;
  tag?: string;
  contextLength?: number;
}

// Models are dynamically fetched from OpenRouter (/api/llm/models)
export const AVAILABLE_MODELS: ModelDefinition[] = [];
