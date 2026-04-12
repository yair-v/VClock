const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

function getToken() {
  return localStorage.getItem('vclock_token');
}

function getHeaders(isJson = true) {
  const headers = {};
  if (isJson) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

function buildUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

async function handleResponse(response) {
  if (!response.ok) {
    let message = 'Request failed';

    try {
      const data = await response.json();
      message = data.message || data.error || message;
    } catch {
      // ignore parse errors
    }

    throw new Error(message);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.blob();
}

export async function apiGet(path) {
  const response = await fetch(buildUrl(path), {
    method: 'GET',
    headers: getHeaders(false)
  });

  return handleResponse(response);
}

export async function apiPost(path, body) {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(body)
  });

  return handleResponse(response);
}

export async function apiPut(path, body) {
  const response = await fetch(buildUrl(path), {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(body)
  });

  return handleResponse(response);
}

export async function exportExcel(path, filename = 'vclock-export.xlsx') {
  const response = await fetch(buildUrl(path), {
    method: 'GET',
    headers: getHeaders(false)
  });

  const blob = await handleResponse(response);
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(downloadUrl);
}
