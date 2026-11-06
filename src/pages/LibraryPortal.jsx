import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import BookCatalogue from '@/components/library/BookCatalogue';
import LoanDesk from '@/components/library/LoanDesk';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { items } from '@/lib/school';
import usePortalUser from '@/lib/usePortalUser';
import { Loader2 } from 'lucide-react';

export default function LibraryPortal() {
  const { user } = usePortalUser();
  const { tab } = useParams();
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [b, l, s, st] = await Promise.all([
      base44.entities.LibraryBook.list({ sort: 'title', limit: 500 }),
      base44.entities.LibraryLoan.list({ sort: '-created_date', limit: 500 }),
      base44.entities.Student.list({ sort: 'full_name', limit: 500 }),
      base44.entities.StaffProfile.list({ sort: 'full_name', limit: 300 }),
    ]);
    setBooks(items(b));
    setLoans(items(l));
    setStudents(items(s).filter((x) => x.status === 'Active'));
    setStaff(items(st).filter((x) => x.active));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const current = tab || 'desk';
  const onLoan = loans.filter((l) => l.status === 'issued');

  return (
    <AppShell role="librarian">
      <PageHeader title={`Welcome${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`} description="Library catalogue, issues and returns." />

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the library…</div>
      ) : (
        <Tabs value={current} onValueChange={(v) => navigate(v === 'desk' ? '/library' : `/library/${v}`)}>
          <TabsList className="mb-5">
            <TabsTrigger value="desk">Desk</TabsTrigger>
            <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
            <TabsTrigger value="loans">Issues &amp; returns</TabsTrigger>
          </TabsList>

          <TabsContent value="desk" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card label="Titles" value={books.length} />
              <Card label="Copies available" value={books.reduce((s, b) => s + (Number(b.copies_available) || 0), 0)} />
              <Card label="Books on loan" value={onLoan.length} />
            </div>
            <LoanDesk books={books} loans={loans} students={students} staff={staff} reload={load} />
          </TabsContent>

          <TabsContent value="catalogue">
            <BookCatalogue books={books} reload={load} />
          </TabsContent>

          <TabsContent value="loans">
            <LoanDesk books={books} loans={loans} students={students} staff={staff} reload={load} />
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function Card({ label, value }) {
  return (
    <div className="surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold">{value}</p>
    </div>
  );
}