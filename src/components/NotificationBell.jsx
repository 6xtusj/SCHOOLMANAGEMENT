import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function csrfToken() {
  return document.cookie.split('; ').find((part) => part.startsWith('school_csrf_token='))?.slice('school_csrf_token='.length) || '';
}

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();
  const seenIds = useRef(new Set());
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Notifications are temporarily unavailable.');
      const nextItems = data.items || [];
      if (hasLoaded.current) {
        nextItems.filter((item) => !item.read_at && !seenIds.current.has(item.id)).forEach((item) => {
          toast({ title: item.subject, description: item.body, duration: 6500 });
        });
      }
      seenIds.current = new Set(nextItems.map((item) => item.id));
      hasLoaded.current = true;
      setItems(nextItems);
      setUnread(data.unread_count || 0);
      setError('');
    } catch (err) { setError(err.message || 'Notifications are temporarily unavailable.'); }
  }, [toast]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 45000);
    return () => window.clearInterval(timer);
  }, [load]);

  const markRead = async (id) => {
    const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken() },
    });
    if (response.ok) load();
  };

  const markAll = async () => {
    const response = await fetch('/api/notifications/read-all', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken() },
    });
    if (response.ok) load();
  };

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) load(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-11 w-11 sm:h-9 sm:w-9" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">{unread > 99 ? '99+' : unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,380px)]">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications {unread > 0 ? `(${unread})` : ''}</DropdownMenuLabel>
          {unread > 0 && <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={markAll}><CheckCheck className="h-3.5 w-3.5" /> Mark all read</Button>}
        </div>
        <DropdownMenuSeparator />
        {error ? <p className="px-3 py-4 text-xs text-destructive">{error}</p> : items.length ? items.slice(0, 12).map((item) => (
          <DropdownMenuItem key={item.id} onSelect={() => { if (!item.read_at) markRead(item.id); if (typeof item.action_url === 'string' && item.action_url.startsWith('/') && !item.action_url.startsWith('//')) navigate(item.action_url); }} className="block cursor-pointer whitespace-normal py-3">
            <div className="flex items-start gap-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? 'bg-muted-foreground/30' : 'bg-primary'}`} />
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold">{item.subject}</p><p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.body}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p></div>
            </div>
          </DropdownMenuItem>
        )) : <p className="px-3 py-5 text-center text-xs text-muted-foreground">You’re all caught up. New school alerts will appear here.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
