import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CommentThread from './CommentThread';

export default function TournamentEntryComments({ entryId, ownerId, defaultOpen }) {
  const { user, listTournamentEntryComments, addTournamentEntryComment, deleteTournamentEntryComment } = useAuth();
  const [comments, setComments] = useState(null);

  useEffect(() => {
    let active = true;
    listTournamentEntryComments(entryId).then((data) => { if (active) setComments(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  async function handleAdd(body) {
    const result = await addTournamentEntryComment(entryId, body, ownerId);
    if (!result.error) setComments((previous) => [...(previous || []), result.comment]);
    return result;
  }

  async function handleDelete(id) {
    const result = await deleteTournamentEntryComment(id);
    if (!result.error) setComments((previous) => (previous || []).filter((comment) => comment.id !== id));
  }

  return <CommentThread comments={comments || []} loading={comments === null} onAdd={handleAdd} onDelete={handleDelete} currentUserId={user?.id} defaultOpen={defaultOpen} />;
}
