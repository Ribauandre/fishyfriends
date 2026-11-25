// What the admin should be told about the nightly backups (migration 0046, supabase/backup/),
// worked out from what backup_status() answers. One place, so the admin page and Home's
// reminder can't disagree.
//
//   'unknown'  couldn't be asked;
//   'no-key'   no backup key has been made, so nothing is being backed up;
//   'waiting'  a key was made in the last few days and the first backup hasn't run yet;
//   'fine'     a backup was kept in the last few days;
//   'never'    a key was made days ago and no backup has ever been kept;
//   'stale'    backups were being kept, and have stopped.
//
// A night can be missed (GitHub runs scheduled jobs late, or skips one when it is busy), so
// it takes more than one missed night to call it stopped.

export const BACKUP_STALE_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

export function backupConcern(status, now = Date.now()) {
  if (!status) return 'unknown';
  if (!status.key) return 'no-key';
  const last = Date.parse(status.lastRun?.finishedAt || '');
  if (Number.isFinite(last)) return now - last > BACKUP_STALE_DAYS * DAY ? 'stale' : 'fine';
  const made = Date.parse(status.key.createdAt || '');
  return Number.isFinite(made) && now - made > BACKUP_STALE_DAYS * DAY ? 'never' : 'waiting';
}

export const backupDay = (iso) => {
  const time = Date.parse(iso || '');
  return Number.isFinite(time) ? new Date(time).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
};

export function backupSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}
