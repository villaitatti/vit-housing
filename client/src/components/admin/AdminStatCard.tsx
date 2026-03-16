import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

interface AdminStatCardProps {
  label: string;
  value: number;
  description?: string;
}

export function AdminStatCard({ label, value, description }: AdminStatCardProps) {
  return (
    <Card className="gap-0 rounded-2xl border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="gap-1 pb-2">
        <CardDescription className="text-sm font-medium text-muted-foreground">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-3xl font-semibold tracking-tight">{value.toLocaleString()}</div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
