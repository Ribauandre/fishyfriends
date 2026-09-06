import React, { useState } from 'react';

export default function CommentThread({ comments, loading, onAdd }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

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
        {!loading && comments?.map((comment) => <div className="comment-row" key={comment.id}><strong>{comment.author_name}</strong><span>{comment.body}</span></div>)}
      </div>
      <form className="comment-form" onSubmit={submit}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a comment..." />
        <button className="button button-quiet" type="submit" disabled={posting || !draft.trim()}>Post</button>
      </form>
    </div>}
  </div>;
}
