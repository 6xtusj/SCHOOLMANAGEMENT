import { Badge } from '@/components/ui/badge';
import { Library } from 'lucide-react';

export default function LibrarySection({ books, loans }) {
  const myLoans = (loans || []).filter((l) => l.status === 'issued');
  const catalogue = (books || []).filter((b) => b.active !== false);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 font-heading text-sm font-semibold">On loan to you</h2>
        {myLoans.length ? (
          <div className="space-y-2">
            {myLoans.map((l) => (
              <div key={l.id} className="surface flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{l.book_title}</p>
                  <p className="text-xs text-muted-foreground">Issued {l.issued_on} · due {l.due_on}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] capitalize">{l.status}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">You have no books out at the moment.</p>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-heading text-sm font-semibold">Library catalogue</h2>
        {catalogue.length ? (
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Title</th>
                    <th className="px-4 py-3 text-left font-medium">Author</th>
                    <th className="px-4 py-3 text-left font-medium">Shelf</th>
                    <th className="px-4 py-3 text-right font-medium">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogue.map((b) => (
                    <tr key={b.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 font-medium">{b.title}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{b.author || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{b.shelf || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{b.copies_available ?? 0} of {b.copies_total ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Library className="h-4 w-4" /> The catalogue is empty.</p>
        )}
      </div>
    </div>
  );
}