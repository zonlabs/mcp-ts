import type { Metadata } from "next";
import { WorkflowDetail } from "@/components/workflows/WorkflowDetail";

export const metadata: Metadata = {
  title: "Workflow — MCP Assistant",
};

export default async function WorkflowDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : undefined;
  return <WorkflowDetail workflowId={id} initialTab={tab} />;
}
