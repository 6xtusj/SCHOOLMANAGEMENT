import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/EmptyState';
import { LEVELS } from '@/lib/school';
import { BookMarked, Plus, Trash2, Loader2 } from 'lucide-react';

const BLANK = { title: '', author: '', isbn: '', category: 'Textbook', level: '', shelf: '', copies_total: 1, notes: '' };

export default function BookCatalogue({ books, reload }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const total = Number(form.copies_total) || 1;
    await base44.entities.LibraryBook.create({
      ...form,
      level: form.level === 'all' ? '' : form.level,
      copies_total: total,
      copies_available: total,
      active: true,
    });
    setSaving(false);
    setForm(BLANK);
    setOpen(false);
    reload();
  };

  const remove = async (book) => {
    await base44.entities.LibraryBook.delete(book.id);
    reload();
  };

  const visible = books.filter((b) => (b.title + ' ' + (b.author || '')).toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the catalogue" className="max-w-xs" />
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add book</Button>
      </div>

      {visible.length ? (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">Author</th>
                  <th className="px-4 py-3 text-left font-medium">Level</th>
                  <th className="px-4 py-3 text-left font-medium">Shelf</th>
                  <th className="px-4 py-3 text-right font-medium">Available</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.title}</p>
                      <p className="text-xs text-muted-foreground">{b.category}{b.isbn ? ` · ${b.isbn}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{b.author || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{b.level || 'All'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{b.shelf || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant={b.copies_available > 0 ? 'secondary' : 'outline'} className="text-[10px]">
                        {b.copies_available ?? 0} / {b.copies_total ?? 0}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => remove(b)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState icon={BookMarked} title="No books in the catalogue" description="Add the first title and it becomes available to students and staff." />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add a book</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Author" value={form.author} onChange={(v) => setForm({ ...form, author: v })} />
              <Field label="ISBN" value={form.isbn} onChange={(v) => setForm({ ...form, isbn: v })} />
              <Field label="Shelf" value={form.shelf} onChange={(v) => setForm({ ...form, shelf: v })} />
              <Field label="Copies" type="number" value={form.copies_total} onChange={(v) => setForm({ ...form, copies_total: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Level</Label>
              <Select value={form.level || 'all'} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !form.title.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add to catalogue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}