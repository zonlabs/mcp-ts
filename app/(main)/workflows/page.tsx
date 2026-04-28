import type { Metadata } from "next";
import { WorkflowsPage } from "@/components/workflows/WorkflowsPage";

export const metadata: Metadata = {
  title: "Workflows — MCP Assistant",
  description: "Create, schedule, and run AI-powered automation workflows",
};

export default function WorkflowsRoute() {
  return <WorkflowsPage />;
}
