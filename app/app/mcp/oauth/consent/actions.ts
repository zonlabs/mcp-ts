"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function approveAction(formData: FormData) {
  const authorizationId = formData.get("authorization_id") as string | null;

  if (!authorizationId) {
    redirect("/mcp/oauth/consent?error=Missing+authorization_id+parameter");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    const consentPath = `/mcp/oauth/consent?authorization_id=${authorizationId}`;
    redirect(`/signin?redirect=${encodeURIComponent(consentPath)}`);
  }

  const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId);

  if (error) {
    redirect(
      `/mcp/oauth/consent?authorization_id=${authorizationId}&error=${encodeURIComponent(error.message)}`
    );
  }

  // redirect() for external URLs (e.g. 127.0.0.1:port) causes Next.js to
  // issue a top-level window.location navigation on the client — no CORS issue.
  redirect(data.redirect_url);
}

export async function denyAction(formData: FormData) {
  const authorizationId = formData.get("authorization_id") as string | null;

  if (!authorizationId) {
    redirect("/mcp/oauth/consent?error=Missing+authorization_id+parameter");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId as string);

  if (error) {
    redirect(
      `/mcp/oauth/consent?authorization_id=${authorizationId}&error=${encodeURIComponent(error.message)}`
    );
  }

  redirect(data.redirect_url);
}
