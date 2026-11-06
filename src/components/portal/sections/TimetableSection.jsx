import TimetableGrid from '@/components/portal/TimeTableGrid';

export default function TimetableSection({ student, timetable, workflowTimetable = [] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Weekly schedule for {student?.class_arm_name || student?.level || 'your class'}.
      </p>
      <TimetableGrid entries={timetable || []} />
      {workflowTimetable.length > 0 && <section className="surface space-y-2 p-4"><h3 className="font-semibold">Session-based timetable</h3>{workflowTimetable.map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><span>{['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][entry.weekday]} · {entry.period} · {entry.subject_id}</span><span className="text-xs text-muted-foreground">{entry.room || 'Room not set'} · {entry.session_id} / {entry.term_id}</span></div>)}</section>}
    </div>
  );
}