export interface MonitoringThreshold {
  namespace_id: string;
  namespace_name?: string;
  storage_bytes_threshold: number | null;
  operation_rate_threshold: number | null;
  latency_p99_threshold_ms: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ThresholdInput {
  namespace_id: string;
  storage_bytes_threshold?: number | null;
  operation_rate_threshold?: number | null;
  latency_p99_threshold_ms?: number | null;
  enabled?: boolean;
}

const API_BASE = '/api/thresholds';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic fetch wrapper returns varying response shapes
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${String(response.status)}`;
    try {
      const errorData: { error?: string } = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Ignored
    }
    throw new Error(errorMessage);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function listThresholds(): Promise<MonitoringThreshold[]> {
  const data = await fetchWithAuth(API_BASE);
  return data.result?.thresholds || [];
}

export async function getThreshold(namespaceId: string): Promise<MonitoringThreshold | null> {
  try {
    const data = await fetchWithAuth(`${API_BASE}/${namespaceId}`);
    return data.result?.threshold || null;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('404')) {
      return null;
    }
    throw err;
  }
}

export async function createThreshold(input: ThresholdInput): Promise<MonitoringThreshold> {
  const data = await fetchWithAuth(API_BASE, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.result?.threshold || data;
}

export async function updateThreshold(namespaceId: string, input: Partial<ThresholdInput>): Promise<MonitoringThreshold> {
  const data = await fetchWithAuth(`${API_BASE}/${namespaceId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.result?.threshold || data;
}

export async function deleteThreshold(namespaceId: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/${namespaceId}`, {
    method: 'DELETE',
  });
}
