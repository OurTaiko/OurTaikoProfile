// Browser requests stay on the website origin, which also serves the API.
const API_ROOT = '/api/v1'
export const endpoints = {
  me: `${API_ROOT}/me`,
  logout: `${API_ROOT}/auth/logout`,
  login: (returnTo: string) =>
    `${API_ROOT}/auth/sso/login?returnTo=${encodeURIComponent(returnTo)}`,
  account: (page: 'profile' | 'register') => `${API_ROOT}/auth/account/${page}`,
  nameplate: `${API_ROOT}/me/nameplate`,
  titles: `${API_ROOT}/titles`,
  myTitles: `${API_ROOT}/me/titles`,
  myTitle: (id: string) => `${API_ROOT}/me/titles/${encodeURIComponent(id)}`,
  user: (id: string) => `${API_ROOT}/users/${id}`,
  userScores: (id: string, query: URLSearchParams) => `${API_ROOT}/users/${id}/scores?${query}`,
  userTitles: (id: string) => `${API_ROOT}/users/${id}/titles`,
  userDans: (id: string) => `${API_ROOT}/users/${id}/dans`,
  adminTitle: (id: string) => `${API_ROOT}/admin/titles/${encodeURIComponent(id)}`,
  adminGrants: `${API_ROOT}/admin/grants`,
}
