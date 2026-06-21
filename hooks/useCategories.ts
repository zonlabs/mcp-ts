"use client";

import { useQuery } from "@tanstack/react-query";
import { Category } from "@/types/mcp";

export function useCategories() {
  const { data: categories = [], isLoading: loading, error } = useQuery<Category[], Error>({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await fetch("/api/categories");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load categories");
      return Array.isArray(j.categories) ? j.categories : [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes stale time since categories rarely change
  });

  return {
    categories,
    loading,
    error: error ? error.message : null,
  };
}
