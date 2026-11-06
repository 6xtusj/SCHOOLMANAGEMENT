import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Users, Wallet, TriangleAlert, ArrowUpRight, CalendarClock, Megaphone, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { base44 } from '@/api/base44Client';
import { billingFor, items, LEVELS, naira, paidFor, today } from '@/lib/school';
import { getSchoolSettings } from '@/lib/schoolSettings';
import usePortalUser from '@/lib/usePortalUser';

export default function AdminDashboard() {
  const { user } = usePortalUser();
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const settings = await getSchoolSettings();
      const session = settings.session || '2025/2026';
      const term = settings.term || 'First Term';
      const todayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

      // Scoped queries: only this term's submitted sheets and today's lessons.
      const [studentRes, staffRes, feeRes, payRes, resultRes, noticeRes, attRes, lessonRes, requestRes] = await Promise.all([
        base44.entities.Student.list({ sort: 'full_name', limit: 500 }),
        base44.entities.StaffProfile.list({ limit: 200 }),
        base44.entities.FeeItem.list({ limit: 200 }),
        base44.entities.Payment.list({ sort: '-created_date', limit: 500 }),
        base44.entities.Result.filter({ session, term, status: 'submitted' }, { limit: 1000 }),
        base44.entities.Notice.list({ sort: '-created_date', limit: 3 }),
        base44.entities.Attendance.filter({ date: today() }, { limit: 800 }),
        base44.entities.TimetableEntry.filter({ day: todayName }, { limit: 400 }),
        base44.entities.PortalRequest.list({ sort: '-created_date', limit: 500 }),
      ]);
      const students = items(studentRes).filter((s) => s.status === 'Active');
      const fees = items(feeRes);
      const payments = items(payRes).filter((p) => p.session === session && p.term === term);
      const collected = paidFor(payments);
      const outstanding = students.reduce((sum, s) => {
        const billed = billingFor(s, fees, session, term);
        const paid = paidFor(items(payRes).filter((p) => p.student_id === s.id && p.session === session && p.term === term));
        return sum + Math.max(billed - paid, 0);
      }, 0);

      const results = items(resultRes);
      const approvalMap = new Map();
      results.filter((r) => r.status === 'submitted').forEach((r) => {
        const key = `${r.class_arm_id}|${r.subject_id}`;
        const entry = approvalMap.get(key) || { subject: r.subject_name, arm: r.class_arm_name, teacher: r.teacher_email, entries: 0 };
        entry.entries += 1;
        approvalMap.set(key, entry);
      });

      const marked = items(attRes);

      setData({
        settings,
        studentCount: students.length,
        staffCount: items(staffRes).filter((s) => s.active).length,
        collected,
        outstanding,
        debtors: students.filter((s) => {
          const billed = billingFor(s, fees, session, term);
          const paid = paidFor(items(payRes).filter((p) => p.student_id === s.id && p.session === session && p.term === term));
          return billed - paid > 0;
        }).length,
        enrolment: LEVELS.map((level) => ({ level, count: students.filter((s) => s.level === level).length })),
        approvals: [...approvalMap.values()].slice(0, 4),
        pendingCount: approvalMap.size,
        notices: items(noticeRes),
        markedArms: new Set(marked.map((m) => m.class_arm_id)).size,
        submittedSheets: approvalMap.size,
        paymentsToday: items(payRes).filter((p) => p.paid_on === today()).length,
        lessonsToday: items(lessonRes).length,
        requests: items(requestRes),
        pendingRequests: items(requestRes).filter((r) => !['resolved', 'rejected'].includes(r.status)).length,
      });
    })();
  }, []);

  const summary = useMemo(() => data, [data]);

  return (
    <AppShell role="admin">
      <PageHeader
        title={`Welcome${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`}
        description={
          summary
            ? `${summary.settings.session || ''} · ${summary.settings.term || ''} — enrolment, academics and fee collection.`
            : 'A quick read on enrolment, academics and fee collection.'
        }
      />

      {!summary ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading school records…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Students enrolled" value={summary.studentCount} hint="Active students on the register" icon={GraduationCap} />
            <StatCard label="Staff members" value={summary.staffCount} hint="Active teachers and principals" icon={Users} />
            <StatCard label="Fees collected" value={naira(summary.collected)} hint="This term to date" icon={Wallet} tone="success" />
            <StatCard label="Outstanding" value={naira(summary.outstanding)} hint={summary.debtors ? `${summary.debtors} students owing` : 'Everyone is up to date'} icon={TriangleAlert} tone="warning" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="surface p-5 lg:col-span-2">
              <h2 className="font-heading text-base font-semibold">Enrolment by level</h2>
              <p className="text-xs text-muted-foreground">Active students placed in class arms</p>
              <div className="mt-4 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.enrolment} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                    <XAxis dataKey="level" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }}
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="surface p-5">
              <h2 className="font-heading text-base font-semibold">Awaiting final approval</h2>
              <p className="text-xs text-muted-foreground">Submitted by subject teachers</p>
              <div className="mt-4 space-y-3">
                {summary.approvals.map((a) => (
                  <div key={a.subject + a.arm} className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-sm font-medium">{a.subject}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.arm} · {a.entries} entries</p>
                  </div>
                ))}
                {!summary.approvals.length && (
                  <p className="text-xs text-muted-foreground">No result sheets are waiting for approval.</p>
                )}
              </div>
              <Link to="/admin/results" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Review results <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="surface p-5">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" />
                <h2 className="font-heading text-base font-semibold">Recent notices</h2>
              </div>
              <div className="mt-4 divide-y divide-border">
                {summary.notices.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="truncate">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{n.published_on}</span>
                  </div>
                ))}
                {!summary.notices.length && <p className="py-3 text-sm text-muted-foreground">No notices published yet.</p>}
              </div>
            </div>

            <div className="surface p-5">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                <h2 className="font-heading text-base font-semibold">Today at a glance</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <Row label="Class arms marked present" value={summary.markedArms} />
                <Row label="Result sheets awaiting approval" value={summary.submittedSheets} />
                <Row label="Payments recorded today" value={summary.paymentsToday} />
                <Row label="Lessons on today's timetable" value={summary.lessonsToday} />
                <Row label="Student/parent requests awaiting response" value={summary.pendingRequests} />
              </div>
              <Link to="/admin/requests" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open student & parent requests <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}