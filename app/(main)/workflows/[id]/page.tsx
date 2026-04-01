import type { Metadata } from "next";
import { WorkflowDetail } from "@/components/workflows/WorkflowDetail";

export const metadata: Metadata = {
  title: "Workflow — MCP Assistant",
};

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkflowDetail workflowId={id} />;
}
