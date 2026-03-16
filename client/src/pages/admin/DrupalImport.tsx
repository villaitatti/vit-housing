import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileArchive,
  Loader2,
  Play,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';
import type {
  DrupalImportPhase,
  DrupalImportPreflightCheck,
  DrupalImportStatus,
  DrupalImportSummary,
} from '@vithousing/shared';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const ACTIVE_STATUSES = new Set<DrupalImportStatus['status']>(['running', 'cleaning_up']);

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDateTime(value: string | null, locale: string): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function phaseLabel(t: ReturnType<typeof useTranslation>['t'], phase: DrupalImportPhase | null): string {
  if (!phase) {
    return t('admin.drupalImportPhaseIdle');
  }

  return t(`admin.drupalImportPhases.${phase}`);
}

function statusBadgeVariant(status: DrupalImportStatus['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'succeeded':
      return 'default';
    case 'preflight_ready':
    case 'uploading':
      return 'secondary';
    case 'failed':
    case 'preflight_failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

function checkIcon(check: DrupalImportPreflightCheck) {
  if (check.status === 'pass') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }

  if (check.status === 'warn') {
    return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  }

  return <XCircle className="h-4 w-4 text-red-600" />;
}

function SummaryStat({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${muted ? 'bg-muted/40' : 'bg-background'}`}>
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ArtifactRow({
  icon,
  title,
  description,
  accepted,
  file,
  uploadedArtifact,
  disabled,
  uploading,
  onChange,
  onUpload,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  accepted: string;
  file: File | null;
  uploadedArtifact: DrupalImportStatus['database_dump'];
  disabled: boolean;
  uploading: boolean;
  onChange: (file: File | null) => void;
  onUpload: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              type="file"
              accept={accepted}
              disabled={disabled}
              onChange={(event) => onChange(event.target.files?.[0] ?? null)}
            />
            <Button type="button" onClick={onUpload} disabled={disabled || uploading || !file}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload
            </Button>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            {file ? `${file.name} • ${formatBytes(file.size)}` : 'No file selected yet.'}
          </div>
          {uploadedArtifact ? (
            <div className="mt-3 rounded-xl border border-dashed bg-muted/40 px-3 py-2 text-sm">
              <div className="font-medium">{uploadedArtifact.filename}</div>
              <div className="text-muted-foreground">
                {formatBytes(uploadedArtifact.size_bytes)} • uploaded {new Date(uploadedArtifact.uploaded_at).toLocaleString()}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DrupalImportPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [databaseDumpFile, setDatabaseDumpFile] = useState<File | null>(null);
  const [filesArchiveFile, setFilesArchiveFile] = useState<File | null>(null);

  const statusQuery = useQuery<DrupalImportStatus>({
    queryKey: queryKeys.drupalImport.status,
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/drupal-import/status');
      return res.data.status;
    },
    refetchInterval: (query) => {
      const status = query.state.data as DrupalImportStatus | undefined;
      return status && ACTIVE_STATUSES.has(status.status) ? 2000 : 5000;
    },
  });

  const logQuery = useQuery<string>({
    queryKey: queryKeys.drupalImport.log,
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/drupal-import/log', {
        responseType: 'text',
      });
      return typeof res.data === 'string' ? res.data : '';
    },
    enabled: Boolean(statusQuery.data?.log_available || (statusQuery.data && ACTIVE_STATUSES.has(statusQuery.data.status))),
    refetchInterval: () => {
      const status = statusQuery.data;
      if (!status) {
        return false;
      }

      return ACTIVE_STATUSES.has(status.status) ? 2000 : false;
    },
  });

  const invalidateStatus = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.drupalImport.status }),
      queryClient.invalidateQueries({ queryKey: queryKeys.drupalImport.log }),
    ]);
  };

  const uploadDatabaseMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('database_dump', file);
      await api.post('/api/v1/admin/drupal-import/uploads/sql', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    },
    onSuccess: async () => {
      toast.success(t('admin.drupalImportDatabaseUploaded'));
      setDatabaseDumpFile(null);
      await invalidateStatus();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const uploadFilesMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('files_archive', file);
      await api.post('/api/v1/admin/drupal-import/uploads/files', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    },
    onSuccess: async () => {
      toast.success(t('admin.drupalImportFilesUploaded'));
      setFilesArchiveFile(null);
      await invalidateStatus();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const preflightMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/admin/drupal-import/preflight');
    },
    onSuccess: async () => {
      toast.success(t('admin.drupalImportPreflightSuccess'));
      await invalidateStatus();
    },
    onError: async (error: Error) => {
      toast.error(error.message);
      await invalidateStatus();
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/admin/drupal-import/start');
    },
    onSuccess: async () => {
      toast.success(t('admin.drupalImportStartSuccess'));
      await invalidateStatus();
    },
    onError: async (error: Error) => {
      toast.error(error.message);
      await invalidateStatus();
    },
  });

  const status = statusQuery.data;
  const isBusy = status ? ACTIVE_STATUSES.has(status.status) : false;
  const canRunPreflight = Boolean(status?.database_dump && status?.files_archive) && !isBusy;
  const canStartMigration = status?.status === 'preflight_ready' && !isBusy;
  const progressPercent = status?.progress_percent ?? 0;

  const apiBaseUrl = useMemo(() => {
    const configured = import.meta.env.VITE_API_BASE_URL || window.location.origin;
    return configured.endsWith('/') ? configured.slice(0, -1) : configured;
  }, []);

  const logUrl = `${apiBaseUrl}/api/v1/admin/drupal-import/log`;
  const auditUrl = `${apiBaseUrl}/api/v1/admin/drupal-import/audit`;

  const summary = status?.summary ?? ({
    source_users: 0,
    source_listings: 0,
    source_listing_photos: 0,
    source_user_pictures: 0,
    imported_users: 0,
    linked_existing_users: 0,
    skipped_users: 0,
    imported_listings: 0,
    linked_existing_listings: 0,
    slug_collisions: 0,
    missing_photos: 0,
    warnings_count: 0,
  } satisfies DrupalImportSummary);

  if (statusQuery.isLoading && !status) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/8 via-background to-background">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{t('admin.drupalImportTitle')}</CardTitle>
            <Badge variant={statusBadgeVariant(status?.status ?? 'idle')}>
              {t(`admin.drupalImportStatuses.${status?.status ?? 'idle'}`)}
            </Badge>
          </div>
          <CardDescription>{t('admin.drupalImportIntro')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-background/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('admin.drupalImportAcceptedDb')}</div>
              <div className="mt-2 font-medium">`*_database.sql.gz`</div>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('admin.drupalImportAcceptedFiles')}</div>
              <div className="mt-2 font-medium">`*_files.tar.gz`</div>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('admin.drupalImportAutomation')}</div>
              <div className="mt-2 text-sm text-muted-foreground">{t('admin.drupalImportAutomationDetail')}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.drupalImportUploadTitle')}</CardTitle>
          <CardDescription>{t('admin.drupalImportUploadDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ArtifactRow
            icon={<Database className="h-5 w-5" />}
            title={t('admin.drupalImportDatabaseLabel')}
            description={t('admin.drupalImportDatabaseDescription')}
            accepted=".sql.gz"
            file={databaseDumpFile}
            uploadedArtifact={status?.database_dump ?? null}
            disabled={isBusy}
            uploading={uploadDatabaseMutation.isPending}
            onChange={setDatabaseDumpFile}
            onUpload={() => {
              if (!databaseDumpFile) {
                toast.error(t('admin.drupalImportChooseDatabase'));
                return;
              }
              uploadDatabaseMutation.mutate(databaseDumpFile);
            }}
          />
          <ArtifactRow
            icon={<FileArchive className="h-5 w-5" />}
            title={t('admin.drupalImportFilesLabel')}
            description={t('admin.drupalImportFilesDescription')}
            accepted=".tar.gz"
            file={filesArchiveFile}
            uploadedArtifact={status?.files_archive ?? null}
            disabled={isBusy}
            uploading={uploadFilesMutation.isPending}
            onChange={setFilesArchiveFile}
            onUpload={() => {
              if (!filesArchiveFile) {
                toast.error(t('admin.drupalImportChooseFiles'));
                return;
              }
              uploadFilesMutation.mutate(filesArchiveFile);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => invalidateStatus()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('admin.drupalImportRefresh')}
            </Button>
            <Button type="button" onClick={() => preflightMutation.mutate()} disabled={!canRunPreflight || preflightMutation.isPending}>
              {preflightMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('admin.drupalImportRunPreflight')}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" disabled={!canStartMigration || startMutation.isPending}>
                  {startMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  {t('admin.drupalImportStartButton')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('admin.drupalImportConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('admin.drupalImportConfirmDescription')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => startMutation.mutate()}>
                    {t('admin.drupalImportStartButton')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.drupalImportPreflightTitle')}</CardTitle>
          <CardDescription>{t('admin.drupalImportPreflightDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.preflight_checks.length ? (
            <div className="space-y-3">
              {status.preflight_checks.map((check) => (
                <div key={check.id} className="flex items-start gap-3 rounded-xl border px-4 py-3">
                  {checkIcon(check)}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{check.label}</div>
                    <div className="text-sm text-muted-foreground">{check.detail}</div>
                  </div>
                  <Badge variant={check.status === 'fail' ? 'destructive' : check.status === 'warn' ? 'secondary' : 'outline'}>
                    {check.status.toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
              {t('admin.drupalImportPreflightEmpty')}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryStat label={t('admin.drupalImportSourceUsers')} value={summary.source_users} muted />
            <SummaryStat label={t('admin.drupalImportSourceListings')} value={summary.source_listings} muted />
            <SummaryStat label={t('admin.drupalImportSourceListingPhotos')} value={summary.source_listing_photos} muted />
            <SummaryStat label={t('admin.drupalImportSourceUserPictures')} value={summary.source_user_pictures} muted />
          </div>

          {status?.warnings.length ? (
            <div className="rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-4 text-amber-950">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                {t('admin.drupalImportWarningsTitle', { count: status.warnings.length })}
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {status.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>{warning.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{status?.current_step ?? t('admin.drupalImportLiveTitle')}</CardTitle>
              <CardDescription>{status?.detail_message ?? t('admin.drupalImportLiveDescription')}</CardDescription>
            </div>
            <Badge variant="outline">{phaseLabel(t, status?.phase ?? null)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-2xl border bg-muted/25 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>{t('admin.drupalImportProgress')}</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${Math.max(0, Math.min(progressPercent, 100))}%` }}
              />
            </div>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
              <div>{t('admin.drupalImportStartedAt')}: {formatDateTime(status?.started_at ?? null, i18n.language)}</div>
              <div>{t('admin.drupalImportFinishedAt')}: {formatDateTime(status?.finished_at ?? null, i18n.language)}</div>
              <div>{t('admin.drupalImportPreflightReadyAt')}: {formatDateTime(status?.preflight_ready_at ?? null, i18n.language)}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <SummaryStat label={t('admin.drupalImportImportedUsers')} value={summary.imported_users} />
            <SummaryStat label={t('admin.drupalImportLinkedUsers')} value={summary.linked_existing_users} />
            <SummaryStat label={t('admin.drupalImportSkippedUsers')} value={summary.skipped_users} />
            <SummaryStat label={t('admin.drupalImportImportedListings')} value={summary.imported_listings} />
            <SummaryStat label={t('admin.drupalImportLinkedListings')} value={summary.linked_existing_listings} />
            <SummaryStat label={t('admin.drupalImportSlugCollisions')} value={summary.slug_collisions} />
            <SummaryStat label={t('admin.drupalImportMissingPhotos')} value={summary.missing_photos} />
            <SummaryStat label={t('admin.drupalImportWarningsShort')} value={summary.warnings_count} />
          </div>

          {status?.error_summary ? (
            <div className="rounded-2xl border border-red-300/70 bg-red-50 px-4 py-4 text-red-950">
              <div className="flex items-center gap-2 font-medium">
                <XCircle className="h-4 w-4" />
                {t('admin.drupalImportFailureTitle')}
              </div>
              <div className="mt-2 text-sm whitespace-pre-wrap">{status.error_summary}</div>
            </div>
          ) : null}

          {status?.status === 'succeeded' ? (
            <div className="rounded-2xl border border-emerald-300/70 bg-emerald-50 px-4 py-4 text-emerald-950">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {t('admin.drupalImportSuccessTitle')}
              </div>
              <div className="mt-2 text-sm">{t('admin.drupalImportSuccessDescription')}</div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" asChild disabled={!status?.log_available}>
              <a href={logUrl} target="_blank" rel="noreferrer">{t('admin.drupalImportOpenLog')}</a>
            </Button>
            <Button type="button" variant="outline" asChild disabled={!status?.audit_available}>
              <a href={auditUrl} target="_blank" rel="noreferrer">{t('admin.drupalImportOpenAudit')}</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.drupalImportLogTitle')}</CardTitle>
          <CardDescription>{t('admin.drupalImportLogDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[28rem] overflow-auto rounded-2xl border bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100 whitespace-pre-wrap">
            {logQuery.data || t('admin.drupalImportLogEmpty')}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
