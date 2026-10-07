/** Transport HTTP unique traversé par toute requête réseau, y compris ressources et enrichissements (07 §1). */
export interface HttpRequestSpec {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface HttpResponseSpec {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface HttpTransport {
  request(spec: HttpRequestSpec): Promise<HttpResponseSpec>;
}
