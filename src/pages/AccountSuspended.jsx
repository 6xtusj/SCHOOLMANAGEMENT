import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

export default function AccountSuspended() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="surface max-w-md p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="mt-4 font-heading text-lg font-semibold">Your portal access is on hold</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This account has been suspended or deactivated by the school. Please contact the school office to have it restored.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => base44.auth.logout('/login')}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
