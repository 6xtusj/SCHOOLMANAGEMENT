import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import usePortalUser from '@/lib/usePortalUser';
import FeeSchedule from '@/components/bursary/FeeSchedule';
import StudentPayments from '@/components/bursary/StudentPayments';
import StaffPayroll from '@/components/bursary/StaffPayroll';
import SchoolPaymentAccounts from '@/components/bursary/SchoolPaymentAccounts';
import StaffBankDetails from '@/components/bursary/StaffBankDetails';
import ApprovalPanel from '@/components/ApprovalPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { billingFor, items, naira, paidFor } from '@/lib/school';
import { getSchoolSettings } from '@/lib/schoolSettings';
import { Loader2, Mail } from 'lucide-react';

export default function BursaryPortal() {
  const { user } = usePortalUser();
  const { tab } = useParams();
  const navigate = useNavigate();
  const [fees, setFees] = useState([]);
  const [archivedFees, setArchivedFees] = useState([]);
  const [payments, setPayments] = useState([]);
  const [staffPayments, setStaffPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [periods, setPeriods] = useState([]);
  const [classArms, setClassArms] = useState([]);
  const [reportSession, setReportSession] = useState('');
  const [reportTerm, setReportTerm] = useState('');
  const [reportArm, setReportArm] = useState('');
  const [reportFee, setReportFee] = useState('school_fees');
  const [feeStatusRows, setFeeStatusRows] = useState([]);
  const [reportMessage, setReportMessage] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderError, setReminderError] = useState('');
  const [sendingReminders, setSendingReminders] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [f, p, sp, s, st, cfg, sessionRows, armRows] = await Promise.all([
        base44.entities.FeeItem.list({ sort: 'name', limit: 300 }),
        base44.entities.Payment.list({ sort: '-created_date', limit: 300 }),
        base44.entities.StaffPayment.list({ sort: '-created_date', limit: 300 }),
        base44.entities.Student.list({ sort: 'full_name', limit: 500 }),
        base44.entities.StaffProfile.list({ sort: 'full_name', limit: 300 }),
        getSchoolSettings(),
        fetch('/api/academic/sessions', { credentials: 'include' }).then(async (response) => { const data = await response.json().catch(() => []); if (!response.ok) throw new Error(data.error || 'Could not load academic sessions.'); return data; }),
        base44.entities.ClassArm.list({ limit: 500 }),
      ]);
      setFees(items(f).filter((fee) => !fee.archived));
      setArchivedFees(items(f).filter((fee) => !!fee.archived));
      setPayments(items(p));
      setStaffPayments(items(sp));
      setStudents(items(s).filter((x) => x.status === 'Active'));
      setStaff(items(st).filter((x) => x.active));
      setSettings(cfg);
      setPeriods(Array.isArray(sessionRows) ? sessionRows : []);
      setClassArms(items(armRows));
      setReportSession((current) => current || cfg.session || sessionRows[0]?.name || '');
      setReportTerm((current) => current || cfg.term || sessionRows.find((row) => row.name === cfg.session)?.terms?.[0]?.name || '');
      setReportArm((current) => current || items(armRows)[0]?.id || '');
    } catch (error) {
      setLoadError(error.message || 'Bursary records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const session = settings.session || '2025/2026';
  const term = settings.term || 'First Term';
  const aliases = { payments: 'desk', receipts: 'approvals' };
  const allowedTabs = ['desk', 'fees', 'status', 'payroll', 'approvals', 'school-accounts', 'staff-bank-details'];
  const requestedTab = aliases[tab] || tab;
  const current = allowedTabs.includes(requestedTab) ? requestedTab : 'desk';

  const collected = paidFor(payments.filter((p) => p.session === session && p.term === term));
  const outstanding = useMemo(
    () => students.reduce((sum, s) => {
      const billed = billingFor(s, fees, session, term);
      const paid = paidFor(payments.filter((p) => p.student_id === s.id && p.session === session && p.term === term));
      return sum + Math.max(billed - paid, 0);
    }, 0),
    [students, fees, payments, session, term]
  );
  const payroll = staffPayments.reduce((sum, p) => sum + (p.type === 'deduction' ? -Number(p.amount) : Number(p.amount)), 0);
  const reportSessionRow = periods.find((row) => row.name === reportSession);
  const reportTerms = reportSessionRow?.terms || [];
  const reportFees = fees.filter((fee) => (!fee.session || fee.session === reportSession) && (!fee.term || fee.term === reportTerm));

  const loadFeeStatus = async () => {
    if (!reportSession || !reportTerm || !reportArm) return;
    setReportMessage('');
    const params = new URLSearchParams({ session: reportSession, term: reportTerm, class_arm_id: reportArm, fee_id: reportFee });
    try {
      const response = await fetch(`/api/bursary/fee-status?${params}`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load fee status.');
      setFeeStatusRows(data.students || []);
    } catch (error) { setReportMessage(error.message); }
  };

  const sendFeeReminders = async () => {
    if (!window.confirm(`Send an email reminder to students or guardians with an outstanding balance for ${term}, ${session}? Emails are sent now and are not scheduled.`)) return;
    setSendingReminders(true);
    setReminderMessage('');
    setReminderError('');
    try {
      const response = await fetch('/api/bursary/fee-reminders', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, term }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not send fee reminders.');
      setReminderMessage(`${data.reminders_sent} reminder${data.reminders_sent === 1 ? '' : 's'} sent to ${data.recipients_sent} recipient${data.recipients_sent === 1 ? '' : 's'}. ${data.recipients_failed ? `${data.recipients_failed} email${data.recipients_failed === 1 ? '' : 's'} could not be delivered. ` : ''}${data.recipients_skipped ? `${data.recipients_skipped} recipient${data.recipients_skipped === 1 ? ' was' : 's were'} skipped by notification preferences.` : ''}`);
    } catch (error) {
      setReminderError(error.message || 'Could not send fee reminders.');
    } finally {
      setSendingReminders(false);
    }
  };

  return (
    <AppShell role="bursar">
      <PageHeader
        title={`Welcome${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`}
        description={`${session} · ${term} — fees, collections and staff payments.`}
        actions={<Button variant="outline" onClick={sendFeeReminders} disabled={sendingReminders}>
          {sendingReminders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          Send fee reminders
        </Button>}
      />
      {(reminderMessage || reminderError) && <p role={reminderError ? 'alert' : 'status'} className={`mb-4 text-sm ${reminderError ? 'text-destructive' : 'text-success'}`}>{reminderError || reminderMessage}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the bursary records…</div>
      ) : loadError ? (
        <div className="surface space-y-3 p-5" role="alert">
          <h2 className="font-heading text-sm font-semibold">Bursary records could not be loaded</h2>
          <p className="text-sm text-destructive">{loadError}</p>
          <Button size="sm" onClick={load}>Try again</Button>
        </div>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Card label="Collected this term" value={naira(collected)} />
            <Card label="Outstanding" value={naira(outstanding)} tone="text-warning" />
            <Card label="Staff payments" value={naira(payroll)} />
          </div>

          <Tabs value={current} onValueChange={(v) => navigate(v === 'desk' ? '/bursary' : `/bursary/${v}`)}>
            <TabsList className="mb-5">
              <TabsTrigger value="desk">Payments</TabsTrigger>
              <TabsTrigger value="fees">Fee structure</TabsTrigger>
              <TabsTrigger value="status">Class fee status</TabsTrigger>
              <TabsTrigger value="payroll">Staff payments</TabsTrigger>
              <TabsTrigger value="approvals">Approval requests</TabsTrigger>
              <TabsTrigger value="school-accounts">School bank accounts</TabsTrigger>
              <TabsTrigger value="staff-bank-details">Staff bank details</TabsTrigger>
            </TabsList>

            <TabsContent value="desk">
              <StudentPayments students={students} payments={payments} fees={fees} session={session} term={term} reload={load} />
            </TabsContent>
            <TabsContent value="fees">
              <FeeSchedule fees={fees} archivedFees={archivedFees} session={session} term={term} reload={load} />
            </TabsContent>
            <TabsContent value="status">
              <section className="surface space-y-4 p-4">
                <div><h2 className="font-heading text-sm font-semibold">Fee payment status by class</h2><p className="text-xs text-muted-foreground">Choose a period, class arm/track and fee to see which students have paid.</p></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Select value={reportSession} onValueChange={(value) => { setReportSession(value); setReportTerm(''); setFeeStatusRows([]); }}><SelectTrigger><SelectValue placeholder="Academic session" /></SelectTrigger><SelectContent>{periods.map((row) => <SelectItem key={row.id} value={row.name}>{row.name}</SelectItem>)}</SelectContent></Select>
                  <Select value={reportTerm} onValueChange={(value) => { setReportTerm(value); setFeeStatusRows([]); }}><SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger><SelectContent>{reportTerms.map((row) => <SelectItem key={row.id} value={row.name}>{row.name}</SelectItem>)}</SelectContent></Select>
                  <Select value={reportArm} onValueChange={(value) => { setReportArm(value); setFeeStatusRows([]); }}><SelectTrigger><SelectValue placeholder="Class arm / track" /></SelectTrigger><SelectContent>{classArms.map((arm) => <SelectItem key={arm.id} value={arm.id}>{arm.display_name || arm.name}</SelectItem>)}</SelectContent></Select>
                  <Select value={reportFee} onValueChange={(value) => { setReportFee(value); setFeeStatusRows([]); }}><SelectTrigger><SelectValue placeholder="Fee" /></SelectTrigger><SelectContent><SelectItem value="school_fees">School fees total</SelectItem>{reportFees.filter((fee) => fee.category === 'other_fee').map((fee) => <SelectItem key={fee.id} value={fee.id}>{fee.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <Button size="sm" disabled={!reportSession || !reportTerm || !reportArm} onClick={loadFeeStatus}>Show class payment status</Button>
                {reportMessage && <p role="status" className="text-sm text-destructive">{reportMessage}</p>}
                {feeStatusRows.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-left">Student</th><th className="p-2 text-left">Admission no.</th><th className="p-2 text-left">Class</th><th className="p-2 text-right">Due</th><th className="p-2 text-left">Status</th></tr></thead><tbody>{feeStatusRows.map((row) => <tr key={row.student_id} className="border-b last:border-0"><td className="p-2">{row.student_name}</td><td className="p-2">{row.admission_no || '—'}</td><td className="p-2">{row.class_arm_name}</td><td className="p-2 text-right">{naira(row.amount_due)}</td><td className="p-2"><Badge variant={row.status === 'paid' ? 'default' : 'destructive'}>{row.status}</Badge></td></tr>)}</tbody></table></div>}
              </section>
            </TabsContent>
            <TabsContent value="payroll">
              <StaffPayroll staff={staff} payments={staffPayments} reload={load} paymentRequestDay={settings.salary_payment_day || 25} />
            </TabsContent>
            <TabsContent value="approvals"><ApprovalPanel role="bursar" /></TabsContent>
            <TabsContent value="school-accounts"><SchoolPaymentAccounts /></TabsContent>
            <TabsContent value="staff-bank-details"><StaffBankDetails /></TabsContent>
          </Tabs>

          <p className="mt-6 text-xs text-muted-foreground">
            Student payments recorded here are the same receipts students and parents see in their portal.
          </p>
        </>
      )}
    </AppShell>
  );
}

function Card({ label, value, tone }) {
  return (
    <div className="surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-heading text-xl font-semibold ${tone || ''}`}>{value}</p>
    </div>
  );
}