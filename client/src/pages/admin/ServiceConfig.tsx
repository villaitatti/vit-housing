import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Pencil, X, Save, Plus, Trash2, RefreshCw } from 'lucide-react';

interface ConfigEntry {
  key: string;
  label: string;
  value: string;
  isSet: boolean;
  isSecret: boolean;
  source: 'database' | 'environment' | 'not_set';
}

interface ServiceConfigGroup {
  service: string;
  label: string;
  configs: ConfigEntry[];
}

interface Auth0Role {
  id: string;
  name: string;
  description: string;
}

interface RoleMapping {
  id?: number;
  auth0_role_id: string;
  auth0_role_name: string;
  local_role: string;
}

const LOCAL_ROLES = [
  { value: 'HOUSE_USER', label: 'User' },
  { value: 'HOUSE_LANDLORD', label: 'Landlord' },
  { value: 'HOUSE_ADMIN', label: 'Admin' },
  { value: 'HOUSE_IT_ADMIN', label: 'IT Admin' },
];

function sourceBadgeVariant(source: ConfigEntry['source']): 'default' | 'secondary' | 'destructive' {
  switch (source) {
    case 'database':
      return 'default';
    case 'environment':
      return 'secondary';
    case 'not_set':
      return 'destructive';
  }
}

function sourceBadgeLabel(source: ConfigEntry['source']): string {
  switch (source) {
    case 'database':
      return 'DB';
    case 'environment':
      return 'ENV';
    case 'not_set':
      return 'Not Set';
  }
}

// Service Configuration Card
function ServiceCard({ group, onSave }: { group: ServiceConfigGroup; onSave: (service: string, configs: { key: string; value: string }[]) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const startEditing = () => {
    const initial: Record<string, string> = {};
    for (const config of group.configs) {
      initial[config.key] = config.isSecret ? '' : config.value;
    }
    setFormValues(initial);
    setEditing(true);
  };

  const handleSave = () => {
    const configs = Object.entries(formValues)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => ({ key, value }));

    if (configs.length === 0) {
      setEditing(false);
      return;
    }

    onSave(group.service, configs);
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg">{group.label}</CardTitle>
          <CardDescription>{t('admin.serviceConfigDescription')}</CardDescription>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil className="h-4 w-4 mr-1" />
            {t('common.edit')}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-1" />
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" />
              {t('common.save')}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {group.configs.map((config) => (
            <div key={config.key} className="flex items-center gap-4">
              <Label className="w-40 text-sm font-medium shrink-0">{config.label}</Label>
              {editing ? (
                <Input
                  type={config.isSecret ? 'password' : 'text'}
                  value={formValues[config.key] ?? ''}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, [config.key]: e.target.value }))
                  }
                  placeholder={config.isSecret ? (config.isSet ? '(leave empty to keep current)' : 'Enter value...') : 'Enter value...'}
                  className="flex-1"
                />
              ) : (
                <div className="flex items-center gap-2 flex-1">
                  <code className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded flex-1 truncate">
                    {config.isSet ? config.value : '—'}
                  </code>
                  <Badge variant={sourceBadgeVariant(config.source)}>
                    {sourceBadgeLabel(config.source)}
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Auth0 Role Mapping Section
function Auth0RoleMappingSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: auth0Roles, isLoading: rolesLoading, refetch: refetchRoles } = useQuery<Auth0Role[]>({
    queryKey: queryKeys.config.auth0Roles,
    queryFn: async () => {
      const res = await api.get('/api/v1/config/auth0/roles');
      return res.data.roles;
    },
    retry: false,
  });

  const { data: existingMappings, isLoading: mappingsLoading } = useQuery<RoleMapping[]>({
    queryKey: queryKeys.config.auth0RoleMappings,
    queryFn: async () => {
      const res = await api.get('/api/v1/config/auth0/role-mappings');
      return res.data.mappings;
    },
  });

  const [mappings, setMappings] = useState<RoleMapping[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Sync from server data when loaded
  if (existingMappings && !initialized && !hasChanges) {
    setMappings(existingMappings);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (data: RoleMapping[]) => {
      await api.put('/api/v1/config/auth0/role-mappings', { mappings: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.auth0RoleMappings });
      toast.success(t('common.save'));
      setHasChanges(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const addMapping = () => {
    setMappings((prev) => [...prev, { auth0_role_id: '', auth0_role_name: '', local_role: 'HOUSE_USER' }]);
    setHasChanges(true);
  };

  const removeMapping = (index: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const updateMapping = (index: number, field: keyof RoleMapping, value: string) => {
    setMappings((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // If selecting an Auth0 role, also set the name
      if (field === 'auth0_role_id' && auth0Roles) {
        const role = auth0Roles.find((r) => r.id === value);
        if (role) {
          updated[index].auth0_role_name = role.name;
        }
      }
      return updated;
    });
    setHasChanges(true);
  };

  if (rolesLoading || mappingsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg">{t('admin.roleMappingTitle')}</CardTitle>
          <CardDescription>{t('admin.roleMappingDescription')}</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchRoles()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t('admin.refreshRoles')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!auth0Roles || auth0Roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.noAuth0Roles')}</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.auth0Role')}</TableHead>
                  <TableHead>{t('admin.localRole')}</TableHead>
                  <TableHead className="w-16">{t('admin.userColumns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((mapping, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Select
                        value={mapping.auth0_role_id}
                        onValueChange={(value) => updateMapping(index, 'auth0_role_id', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('admin.selectAuth0Role')} />
                        </SelectTrigger>
                        <SelectContent>
                          {auth0Roles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={mapping.local_role}
                        onValueChange={(value) => updateMapping(index, 'local_role', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOCAL_ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMapping(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between mt-4">
              <Button variant="outline" size="sm" onClick={addMapping}>
                <Plus className="h-4 w-4 mr-1" />
                {t('admin.addMapping')}
              </Button>
              {hasChanges && (
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate(mappings.filter((m) => m.auth0_role_id))}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {t('admin.saveMappings')}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Main Page
export function ServiceConfigPage() {
  const { service } = useParams<{ service: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: serviceData, isLoading, isError } = useQuery<{ groups: ServiceConfigGroup[] }>({
    queryKey: queryKeys.config.services,
    queryFn: async () => {
      const res = await api.get('/api/v1/config/services');
      return res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ service, configs }: { service: string; configs: { key: string; value: string }[] }) => {
      await api.put(`/api/v1/config/services/${service}`, { configs });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.services });
      toast.success(t('common.save'));
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSave = (serviceName: string, configs: { key: string; value: string }[]) => {
    updateMutation.mutate({ service: serviceName, configs });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-muted-foreground">{t('errors.forbidden')}</p>;
  }

  const groups = serviceData?.groups ?? [];
  const currentGroup = groups.find((g) => g.service === service);

  if (!currentGroup) {
    return <p className="text-muted-foreground">{t('errors.notFound')}</p>;
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">{currentGroup.label}</h2>
      <div className="space-y-6">
        <ServiceCard group={currentGroup} onSave={handleSave} />
        {service === 'auth0' && <Auth0RoleMappingSection />}
      </div>
    </div>
  );
}
