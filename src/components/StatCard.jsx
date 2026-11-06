import { cn } from '@/lib/utils';

export default function StatCard({ label, value, hint, icon: Icon, tone = 'default' }) {
  const toneMap = {
    default: 'text-primary bg-primary/10',
    success: 'text-[hsl(var(--success))] bg-[hsl(var(--success))]/12',
    warning: 'text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/12',
    muted: 'text-muted-foreground bg-muted',
  };

  return (
    <div className="surface p-4 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-heading text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneMap[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
    </div>
  );
}