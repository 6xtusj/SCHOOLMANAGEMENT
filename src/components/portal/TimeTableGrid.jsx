import { DAYS } from '@/lib/school';

export default function TimetableGrid({ entries, title }) {
  return (
    <div>
      {title && <h3 className="mb-3 font-heading text-sm font-semibold">{title}</h3>}
      <div className="grid gap-3 md:grid-cols-5">
        {DAYS.map((day) => {
          const lessons = entries.filter((e) => e.day === day).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
          return (
            <div key={day} className="rounded-lg border border-border p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{day}</p>
              <div className="space-y-2">
                {lessons.map((l) => (
                  <div key={l.id} className="rounded-md bg-primary/5 p-2">
                    <p className="text-[11px] font-semibold text-primary">{l.start_time}–{l.end_time}</p>
                    <p className="text-sm font-medium leading-tight">{l.subject_name}</p>
                    <p className="text-[11px] text-muted-foreground">{l.teacher_name}</p>
                  </div>
                ))}
                {!lessons.length && <p className="text-[11px] text-muted-foreground">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}