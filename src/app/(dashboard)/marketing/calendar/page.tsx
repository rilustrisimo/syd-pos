'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, Plus, Check, X as XIcon, Trash2, Facebook, Instagram } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  useScheduledPosts,
  useCreateScheduledPost,
  useMarkScheduledPostStatus,
  useDeleteScheduledPost,
  type ScheduledPost,
} from '@/hooks/useScheduledPosts'
import { useContentSuggestions, type SuggestionPlatform } from '@/hooks/useContentSuggestions'
import { getContentMediaUrl } from '@/hooks/useContentMedia'
import { MediaLightbox } from '@/components/marketing/media-lightbox'

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
  posted: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function ScheduleDialog({ open, onOpenChange, defaultDate }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate: Date
}) {
  const { data: approved = [] } = useContentSuggestions('approved')
  const create = useCreateScheduledPost()

  const [suggestionId, setSuggestionId] = useState('')
  const [platform, setPlatform] = useState<SuggestionPlatform>('facebook')
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes, setNotes] = useState('')

  function toLocalInputValue(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setSuggestionId('')
      setPlatform('facebook')
      setScheduledAt(toLocalInputValue(defaultDate))
      setNotes('')
    }
    onOpenChange(next)
  }

  async function handleCreate() {
    if (!suggestionId || !scheduledAt) {
      toast.error('Pick an approved suggestion and a date/time.')
      return
    }
    try {
      await create.mutateAsync({
        suggestion_id: suggestionId,
        platform,
        scheduled_at: new Date(scheduledAt).toISOString(),
        notes: notes.trim() || undefined,
      })
      toast.success('Post scheduled')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || 'Failed to schedule')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Approved suggestion</label>
            <Select value={suggestionId} onValueChange={setSuggestionId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Pick an approved suggestion" />
              </SelectTrigger>
              <SelectContent>
                {approved.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400">No approved suggestions yet</div>
                ) : (
                  approved.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {(s.source_product?.name ? `${s.source_product.name} — ` : '') + (s.caption_final ?? s.caption_draft).slice(0, 50)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Platform</label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as SuggestionPlatform)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Date &amp; time</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={create.isPending}>
            {create.isPending ? 'Scheduling...' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScheduledPostItem({ post }: { post: ScheduledPost }) {
  const markStatus = useMarkScheduledPostStatus()
  const deletePost = useDeleteScheduledPost()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const caption = post.suggestion?.caption_final ?? post.suggestion?.caption_draft ?? ''
  const creativeUrl = post.suggestion?.creative_media ? getContentMediaUrl(post.suggestion.creative_media.storage_key) : null
  const time = new Date(post.scheduled_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

  return (
    <Card>
      <CardContent className="p-3 flex gap-3">
        {creativeUrl && (
          <div className="w-14 h-14 rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
            <MediaLightbox
              url={creativeUrl}
              mediaType="image"
              label="Creative"
              trigger={
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creativeUrl} alt="Creative" className="w-full h-full object-cover" />
              }
            />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-600">{time}</span>
            <Badge variant="outline" className={STATUS_COLORS[post.status]}>{post.status}</Badge>
            <Badge variant="outline" className="capitalize gap-1">
              {post.platform === 'instagram' ? <Instagram className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
              {post.platform}
            </Badge>
          </div>
          {post.suggestion?.source_product && (
            <p className="text-xs text-slate-500">{post.suggestion.source_product.name}</p>
          )}
          <p className="text-sm text-slate-700 line-clamp-2">{caption}</p>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {post.status === 'scheduled' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                onClick={() => markStatus.mutate({ id: post.id, status: 'posted' })}
                title="Mark posted"
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                onClick={() => markStatus.mutate({ id: post.id, status: 'failed' })}
                title="Mark failed"
              >
                <XIcon className="w-4 h-4" />
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this scheduled post?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePost.mutate(post.id, { onSuccess: () => setShowDeleteConfirm(false) })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export default function MarketingCalendarPage() {
  const { data: posts = [], isLoading } = useScheduledPosts()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [showSchedule, setShowSchedule] = useState(false)

  const postDates = useMemo(() => posts.map((p) => new Date(p.scheduled_at)), [posts])
  const postsForSelectedDay = useMemo(
    () => posts.filter((p) => sameDay(new Date(p.scheduled_at), selectedDate))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [posts, selectedDate]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-6 h-6" />
            Content Calendar
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Schedule approved posts and mark them posted when done</p>
        </div>
        <Button onClick={() => setShowSchedule(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Schedule a Post
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
        <Card className="w-fit">
          <CardContent className="p-2">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              modifiers={{ hasPost: postDates }}
              modifiersClassNames={{ hasPost: 'after:content-[""] after:block after:w-1 after:h-1 after:rounded-full after:bg-blue-500 after:mx-auto after:mt-0.5' }}
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {selectedDate.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Loading...</div>
          ) : postsForSelectedDay.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <CalendarClock className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nothing scheduled for this day</p>
            </div>
          ) : (
            <div className="space-y-2">
              {postsForSelectedDay.map((p) => <ScheduledPostItem key={p.id} post={p} />)}
            </div>
          )}
        </div>
      </div>

      <ScheduleDialog open={showSchedule} onOpenChange={setShowSchedule} defaultDate={selectedDate} />
    </div>
  )
}
