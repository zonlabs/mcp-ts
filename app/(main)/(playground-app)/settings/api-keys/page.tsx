import { redirect } from "next/navigation";

export default function ApiKeysPage() {
  redirect("/mcp?remote-mcp=activity");
}
