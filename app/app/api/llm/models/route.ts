import { NextResponse } from 'next/server';

export interface OpenRouterModelItem {
  id: string;
  name: string;
  description?: string;
  provider: string;
  contextLength?: number;
  tag?: string;
}

const VENDOR_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  deepseek: 'DeepSeek',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  qwen: 'Qwen',
  'x-ai': 'xAI',
  cohere: 'Cohere',
  amazon: 'Amazon',
  microsoft: 'Microsoft',
  perplexity: 'Perplexity',
  openrouter: 'OpenRouter',
  'z-ai': 'Z-AI',
  moonshotai: 'Moonshot AI',
  kimi: 'Kimi',
};

function formatVendorName(rawVendor: string): string {
  if (VENDOR_NAMES[rawVendor.toLowerCase()]) {
    return VENDOR_NAMES[rawVendor.toLowerCase()];
  }
  return rawVendor.charAt(0).toUpperCase() + rawVendor.slice(1);
}

export const revalidate = 3600;

export async function GET() {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://app.linkos.in',
        'X-Title': 'LinkOS',
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.warn(`[OpenRouter Models] Fetch failed with status ${response.status}`);
      return NextResponse.json({ models: [], error: 'Failed to fetch OpenRouter models' }, { status: response.status });
    }

    const json = await response.json();
    const rawList: any[] = Array.isArray(json?.data) ? json.data : [];

    const models: OpenRouterModelItem[] = rawList.map((item) => {
      const id: string = item.id;
      const parts = id.split('/');
      const rawVendor = (parts.length > 1 ? parts[0] : 'openrouter').replace(/^~/, '');
      const vendor = formatVendorName(rawVendor);

      let name: string = item.name || id;
      if (name.includes(': ')) {
        name = name.split(': ').slice(1).join(': ');
      }

      const promptPrice = parseFloat(item.pricing?.prompt || '0');
      let tag: string | undefined;
      if (promptPrice === 0) {
        tag = 'Free';
      } else if (id.includes('r1') || id.includes('reasoner') || id.includes('thinking')) {
        tag = 'Reasoning';
      } else if (id.includes('flash') || id.includes('mini') || id.includes('haiku')) {
        tag = 'Fast';
      }

      return {
        id,
        name,
        description: item.description,
        provider: vendor,
        contextLength: item.context_length,
        tag,
      };
    });

    return NextResponse.json(
      {
        models,
        source: 'openrouter',
        total: models.length,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error) {
    console.error('[OpenRouter Models] Error fetching models:', error);
    return NextResponse.json({ models: [], error: 'Failed to load models' }, { status: 500 });
  }
}
