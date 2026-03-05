/**
 * GraphQL Client
 * Centralized GraphQL query/mutation execution with error handling
 */

interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string; extensions?: any }>;
}

interface GraphQLRequestOptions {
  query: string;
  variables?: Record<string, any>;
  headers?: Record<string, string>;
}

/**
 * Execute a GraphQL query or mutation
 * @param options - Query/mutation string, variables, and optional headers
 * @returns Parsed response data
 * @throws Error if GraphQL errors occur or network request fails
 */
export async function executeGraphQL<T = any>(
  options: GraphQLRequestOptions
): Promise<T> {
  const { query, variables = {}, headers = {} } = options;

  try {
    const response = await fetch('/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result: GraphQLResponse<T> = await response.json();

    if (result.errors && result.errors.length > 0) {
      const errorMessage = result.errors
        .map((e) => e.message)
        .join(', ');
      throw new Error(errorMessage);
    }

    if (!result.data) {
      throw new Error('No data returned from GraphQL query');
    }

    return result.data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unknown error occurred during GraphQL request');
  }
}

/**
 * Convenience function for executing GraphQL queries
 * @param query - GraphQL query string
 * @param variables - Query variables
 * @returns Query result data
 */
export async function query<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  return executeGraphQL<T>({ query, variables });
}

/**
 * Convenience function for executing GraphQL mutations
 * @param mutation - GraphQL mutation string
 * @param variables - Mutation variables
 * @returns Mutation result data
 */
export async function mutate<T = any>(
  mutation: string,
  variables?: Record<string, any>
): Promise<T> {
  return executeGraphQL<T>({ query: mutation, variables });
}
