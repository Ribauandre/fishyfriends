import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CommentThread from './CommentThread';

export default function PersonalBestComments({ personalBestId }) {
  const { user, listComments, addComment, deleteComment } = useAuth();
  const [comments, setComments] = useState(null);

  useEffect(() => {
    let active = true;
    listComments(personalBestId).then((data) => { if (active) setComments(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalBestId]);

  async function handleAdd(body) {
    const result = await addComment(personalBestId, body);
    if (!result.error) setComments((previous) => [...(previous || []), result.comment]);
    return result;
  }

  async function handleDelete(id) {
    const result = await deleteComment(id);
    if (!result.error) setComments((previous) => (previous || []).filter((comment) => comment.id !== id));
  }

  return <CommentThread comments={comments || []} loading={comments === null} onAdd={handleAdd} onDelete={handleDelete} currentUserId={user?.id} />;
}
