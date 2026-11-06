import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import { FileText, Download, Loader2, Upload } from 'lucide-react';

export default function DocumentsSection({ student, documents, onChanged }) {
  const [busy, setBusy] = useState(false);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !student) return;
    setBusy(true);
    const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
    await base44.entities.StudentDocument.create({
      student_id: student.id,
      student_name: student.full_name,
      student_email: student.user_email,
      guardian_email: student.guardian_email,
      class_arm_id: student.class_arm_id,
      class_arm_name: student.class_arm_name,
      title: file.name,
      category: 'other',
      file_uri,
      file_name: file.name,
      uploaded_by: 'Portal upload',
    });
    setBusy(false);
    event.target.value = '';
    onChanged();
  };

  const open = async (doc) => {
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri, expires_in: 300 });
    window.open(signed_url, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">Your documents</p>
          <p className="text-xs text-muted-foreground">Students and linked parents can upload files for this student. Admin, Principal and Bursary can share school records; the linked student/parent and the assigned class teacher can view them.</p>
        </div>
        <label>
          <input type="file" className="hidden" onChange={upload} disabled={busy || !student} />
          <Button asChild variant="outline" className="gap-2" disabled={busy || !student}>
            <span>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload file</span>
          </Button>
        </label>
      </div>

      {(documents || []).length ? (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="surface flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.title}</p>
                  <p className="text-xs capitalize text-muted-foreground">{doc.category} · {doc.uploaded_by || 'School office'}</p>
                </div>
              </div>
              {doc.file_uri ? (
                <Button variant="ghost" size="icon" onClick={() => open(doc)} aria-label="Download document">
                  <Download className="h-4 w-4" />
                </Button>
              ) : (
                <Badge variant="outline" className="text-[10px]">No file</Badge>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={FileText} title="No documents yet" description="Documents shared by the school appear here." />
      )}
    </div>
  );
}