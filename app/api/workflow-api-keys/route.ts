import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateWorkflowApiKeyRaw,
  hashWorkflowApiKey,
  requireWorkflowApiKeyPepper,
} from "@/lib/workflow-api-key";

type WorkflowApiKeyRow = {
  id: string;
  key_prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("workflow_user_api_keys")
      .select("id, key_prefix, label, created_at, last_used_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message, hint: "Run workflow_user_api_keys migration in Supabase (database.sql)." },
        { status: 500 }
      );
    }

    return NextResponse.json({ keys: (data ?? []) as WorkflowApiKeyRow[] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let pepper: string;
  try {
    pepper = requireWorkflowApiKeyPepper();
  } catch {
    return NextResponse.json(
      {
        error:
          "Server missing WORKFLOW_API_KEY_PEPPER (min 16 chars). Set the same value in mcp-client and workflow-automation-engine .env.",
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerEmail = user.email?.trim().toLowerCase();
  if (!ownerEmail) {
    return NextResponse.json(
      { error: "Your account must have an email address to create workflow API keys." },
      { status: 400 }
    );
  }

  let label: string | null = null;
  try {
    const body = (await request.json()) as { label?: string };
    if (typeof body.label === "string" && body.label.trim()) {
      label = body.label.trim().slice(0, 120);
    }
  } catch {
    /* empty body ok */
  }

  const raw = generateWorkflowApiKeyRaw();
  const key_hash = hashWorkflowApiKey(raw, pepper);
  const key_prefix = raw.slice(0, 14);

  const { data, error } = await supabase
    .from("workflow_user_api_keys")
    .insert({
      user_id: user.id,
      owner_email: ownerEmail,
      key_hash,
      key_prefix,
      label,
    })
    .select("id, key_prefix, label, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Ensure workflow_user_api_keys table and RLS exist." },
      { status: 500 }
    );
  }

  const row = data as {
    id: string;
    key_prefix: string;
    label: string | null;
    created_at: string;
  };

  return NextResponse.json(
    {
      api_key: raw,
      id: row.id,
      key_prefix: row.key_prefix,
      label: row.label,
      created_at: row.created_at,
    },
    { status: 201 }
  );
}
