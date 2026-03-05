import { redirect } from "next/navigation";

export default function RemoteBridgeRedirectPage() {
  redirect("/gateway");
}
