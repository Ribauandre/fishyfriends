import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CommentThread from './CommentThread';

export default function PersonalBestComments({ personalBestId }) {
  const { listComments, addComment } = useAuth();
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

  return <CommentThread comments={comments || []} loading={comments === null} onAdd={handleAdd} />;
}
