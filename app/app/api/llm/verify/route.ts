import { NextResponse } from 'next/server';

export interface VerifyKeyResult {
  valid: boolean;
  label?: string | null;
  usage?: number | null;
  limit?: number | null;
  isFreeTier?: boolean;
  rateLimit?: {
    requests?: number;
    interval?: string;
  } | null;
  error?: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';

    if (!apiKey) {
      return NextResponse.json(
        { valid: false, error: 'OpenRouter API key is required' },
        { status: 400 }
      );
    }

    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://app.linkos.in',
        'X-Title': 'LinkOS',
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const status = response.status;
      let errorMsg = 'Failed to verify API key';

      if (status === 401) {
        errorMsg = 'Invalid API key. Please check the key in OpenRouter.';
      } else if (data?.error?.message) {
        errorMsg = data.error.message;
      }

      return NextResponse.json(
        { valid: false, error: errorMsg },
        { status: response.status }
      );
    }

    const keyData = data?.data || {};

    return NextResponse.json<VerifyKeyResult>({
      valid: true,
      label: keyData.label || null,
      usage: typeof keyData.usage === 'number' ? keyData.usage : null,
      limit: typeof keyData.limit === 'number' ? keyData.limit : null,
      isFreeTier: Boolean(keyData.is_free_tier),
      rateLimit: keyData.rate_limit || null,
    });
  } catch (err: any) {
    console.error('[Verify API Key] Error:', err);
    return NextResponse.json(
      { valid: false, error: err?.message || 'Network error verifying key' },
      { status: 500 }
    );
  }
}
