"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";

type CopyButtonProps = {
  text: string;
  label?: string;
};

export function CopyButton({ text, label = "Copy URL" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 px-2.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success("Copied");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Could not copy");
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
