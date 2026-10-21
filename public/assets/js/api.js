/** Thin wrapper around the PHP API. Every call resolves to the response's `data`. */

const BASE = 'api'; // relative, so the app works from any sub-folder

export class ApiError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const options = { method, headers: { Accept: 'application/json' } };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  }
  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body, e.g. a PHP fatal error page.
  }
  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(response.status, error.message ?? `Request failed (${response.status}).`, error);
  }
  return payload?.data;
}

/** Only the fields the save endpoint reads. */
function toLayout(dashboard) {
  return {
    name: dashboard.name,
    version: dashboard.version,
    settings: dashboard.settings,
    sections: dashboard.sections.map(({ id, x, y, width, height, zIndex, style, elements }) => ({
      id, x, y, width, height, zIndex, style,
      elements: elements.map(({ id, type, x, y, width, height, zIndex, style, content }) => ({
        id, type, x, y, width, height, zIndex, style, content,
      })),
    })),
  };
}

export const api = {
  listDashboards: () => request('GET', '/dashboards'),
  getDashboard: (id) => request('GET', `/dashboards/${encodeURIComponent(id)}`),
  createDashboard: (name) => request('POST', '/dashboards', { name }),
  saveDashboard: (dashboard) => request('PUT', `/dashboards/${encodeURIComponent(dashboard.id)}`, toLayout(dashboard)),
  deleteDashboard: (id) => request('DELETE', `/dashboards/${encodeURIComponent(id)}`),

  uploadImage(file) {
    const form = new FormData();
    form.append('image', file);
    return request('POST', '/uploads', form);
  },

  chartData: ({ metric, granularity, points }) =>
    request('GET', `/chart-data?${new URLSearchParams({ metric, granularity, points })}`),
  chartMetrics: () => request('GET', '/chart-data/metrics'),
};
