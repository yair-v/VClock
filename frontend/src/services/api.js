const API_BASE = 'http://localhost:3000';

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

async function handleResponse(response) {
  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = await response.json();
      message = data.message || message;
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
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: getHeaders(false),
  });
  return handleResponse(response);
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

export async function apiPut(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

export function downloadFile(url) {
  const token = getToken();
  window.open(`${API_BASE}${url}${url.includes('?') ? '&' : '?'}tokenHack=${encodeURIComponent(token || '')}`, '_blank');
}

export async function exportExcel(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: getHeaders(false),
  });
  const blob = await handleResponse(response);
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = 'vclock-attendance.xlsx';
  a.click();
  window.URL.revokeObjectURL(downloadUrl);
}
