import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CommentThread from './CommentThread';

export default function FishYearCatchComments({ catchId, ownerId, defaultOpen }) {
  const { user, listFishYearComments, addFishYearComment, deleteFishYearComment } = useAuth();
  const [comments, setComments] = useState(null);

  useEffect(() => {
    let active = true;
    listFishYearComments(catchId).then((data) => { if (active) setComments(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catchId]);

  async function handleAdd(body) {
    const result = await addFishYearComment(catchId, body, ownerId);
    if (!result.error) setComments((previous) => [...(previous || []), result.comment]);
    return result;
  }

  async function handleDelete(id) {
    const result = await deleteFishYearComment(id);
    if (!result.error) setComments((previous) => (previous || []).filter((comment) => comment.id !== id));
  }

  return <CommentThread comments={comments || []} loading={comments === null} onAdd={handleAdd} onDelete={handleDelete} currentUserId={user?.id} defaultOpen={defaultOpen} />;
}
