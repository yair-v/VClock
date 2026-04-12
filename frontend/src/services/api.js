const API_PREFIX = '/api';

function getToken() {
  return localStorage.getItem('vclock_token');
}

function buildUrl(path) {
  const normalized = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${API_PREFIX}${normalized}`;
}

function getHeaders(isJson = true) {
  const headers = {};
  if (isJson) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

async function handleResponse(response) {
  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = await response.json();
      message = data.error || data.message || message;
    } catch {
      // ignore
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

export async function apiDelete(path) {
  const token = localStorage.getItem('vclock_token');

  const res = await fetch(`/api${path}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'Delete failed');
  }

  return data;
}

export async function exportExcel(path) {
  const response = await fetch(buildUrl(path), {
    method: 'GET',
    headers: getHeaders(false)
  });

  const blob = await handleResponse(response);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vclock-export.xlsx';
  a.click();
  window.URL.revokeObjectURL(url);
}
