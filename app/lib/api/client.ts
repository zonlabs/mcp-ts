/**
 * Core API Client for LinkOS
 * Single source of truth for making type-safe HTTP requests to internal and external APIs.
 */

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | null | undefined>;
}

export async function apiClient<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, headers, ...rest } = options;

  let url = endpoint;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  const defaultHeaders: Record<string, string> = {};
  if (rest.body && typeof rest.body === "string") {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    ...rest,
    headers: {
      ...defaultHeaders,
      ...headers,
    },
  });

  if (!res.ok) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch {
      // response might not be JSON
    }
    const message =
      errorData?.error ||
      errorData?.message ||
      `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, errorData);
  }

  // Handle empty bodies (204 No Content, DELETE requests)
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }

  return (await res.json()) as T;
}
