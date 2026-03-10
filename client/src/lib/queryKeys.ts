export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  listings: {
    all: ['listings'] as const,
    list: (filters: object) => ['listings', 'list', filters] as const,
    detailById: (id: number) => ['listings', 'detail', 'id', id] as const,
    detailBySlug: (slug: string) => ['listings', 'detail', 'slug', slug] as const,
    mine: (filters: object) => ['listings', 'mine', filters] as const,
    latest: ['listings', 'latest'] as const,
  },
  users: {
    all: ['users'] as const,
    list: (filters: object) => ['users', 'list', filters] as const,
    detail: (id: number) => ['users', 'detail', id] as const,
  },
  invitations: {
    all: ['invitations'] as const,
    validate: (token: string) => ['invitations', 'validate', token] as const,
  },
  config: {
    services: ['config', 'services'] as const,
    public: ['config', 'public'] as const,
    auth0Roles: ['config', 'auth0', 'roles'] as const,
    auth0RoleMappings: ['config', 'auth0', 'role-mappings'] as const,
  },
};
