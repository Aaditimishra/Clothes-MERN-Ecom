/**
 * The one error shape every endpoint returns.
 *
 * A single envelope means the client has exactly one branch for failure. The
 * `fields` map is what lets a form highlight the offending input rather than
 * dumping a sentence at the top of the page.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}
