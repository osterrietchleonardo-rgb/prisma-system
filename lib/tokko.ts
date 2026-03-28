export const TOKKO_API_BASE_URL = process.env.TOKKO_API_BASE_URL || 'https://api.tokkobroker.com/api/v1';

export const fetchTokko = async (endpoint: string, apiKey: string, options: RequestInit = {}) => {
  const method = options.method?.toUpperCase() || 'GET'
  const url = `${TOKKO_API_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${apiKey}&lang=es`;
  
  const headers: Record<string, string> = {}
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
  }
  
  const response = await fetch(url, {
    ...options,
    method,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`Tokko API error (${response.status}): ${errorBody}`);
  }

  return response.json();
};


export const syncPropertiesFromTokko = async (apiKey: string) => {
  let allProperties: any[] = [];
  const limit = 100;
  let offset = 0;
  let totalCount = 1;

  while (offset < totalCount) {
    const data = await fetchTokko(`/property/?limit=${limit}&offset=${offset}`, apiKey, { method: 'GET' });
    
    if (data.objects) {
      allProperties = [...allProperties, ...data.objects];
    }
    
    totalCount = data.meta?.total_count || 0;
    offset += limit;
    
    // Safety break
    if (offset > 2000) break;
  }
  
  return allProperties;
};

export const getLeadConsultas = async (apiKey: string, _daysBack: number = 7) => {
  // Fetch recent queries/leads from Tokko
  // Example endpoint: /webcontact/
  const data = await fetchTokko('/webcontact/', apiKey, { method: 'GET' });
  return data.objects || [];
};

export const createTokkoContact = async (apiKey: string, contactData: Record<string, unknown>) => {
  return fetchTokko('/webcontact/', apiKey, {
    method: 'POST',
    body: JSON.stringify(contactData)
  });
};
