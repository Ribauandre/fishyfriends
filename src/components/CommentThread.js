import React, { useEffect, useRef, useState } from 'react';

export default function CommentThread({ comments, loading, onAdd, onDelete, currentUserId, defaultOpen, highlightCommentId }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const highlightRef = useRef(null);

  useEffect(() => {
    if (open && highlightCommentId) highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [open, highlightCommentId, comments]);

  async function submit(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    const result = await onAdd(draft.trim());
    setPosting(false);
    if (!result?.error) setDraft('');
  }

  return <div className="comment-thread">
    <button type="button" className="comment-toggle" onClick={() => setOpen(!open)}>{open ? 'Hide comments' : `Comments${comments?.length ? ` (${comments.length})` : ''}`}</button>
    {open && <div className="comment-body">
      <div className="comment-list">
        {loading && <p className="month-empty">Loading comments...</p>}
        {!loading && comments?.length === 0 && <p className="month-empty">No comments yet. Say something.</p>}
        {!loading && comments?.map((comment) => {
          const isHighlighted = comment.id === highlightCommentId;
          return <div className={`comment-row ${isHighlighted ? 'is-shared-highlight' : ''}`} key={comment.id} ref={isHighlighted ? highlightRef : null}>
            <strong>{comment.author_name}</strong><span>{comment.body}</span>
            {onDelete && currentUserId && comment.user_id === currentUserId && <button type="button" className="comment-remove" onClick={() => onDelete(comment.id)} aria-label="Delete comment">×</button>}
          </div>;
        })}
      </div>
      <form className="comment-form" onSubmit={submit}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a comment..." />
        <button className="button button-quiet" type="submit" disabled={posting || !draft.trim()}>Post</button>
      </form>
    </div>}
  </div>;
}
