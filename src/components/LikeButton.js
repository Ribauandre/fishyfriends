import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LikeButton({ targetType, targetId, ownerId }) {
  const { user, listLikes, likeTarget, unlikeTarget } = useAuth();
  const [likes, setLikes] = useState(null);

  useEffect(() => {
    let active = true;
    listLikes(targetType, targetId).then((data) => { if (active) setLikes(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  const liked = (likes || []).some((like) => like.user_id === user?.id);
  const count = (likes || []).length;

  async function toggle() {
    if (liked) {
      setLikes((previous) => (previous || []).filter((like) => like.user_id !== user?.id));
      const result = await unlikeTarget(targetType, targetId);
      if (result.error) setLikes((previous) => [...(previous || []), { user_id: user.id }]);
    } else {
      setLikes((previous) => [...(previous || []), { user_id: user?.id }]);
      const result = await likeTarget(targetType, targetId, ownerId);
      if (result.error) setLikes((previous) => (previous || []).filter((like) => like.user_id !== user?.id));
    }
  }

  return <button className={`like-button ${liked ? 'is-liked' : ''}`} type="button" onClick={toggle} disabled={likes === null} aria-pressed={liked}>
    <span>{liked ? '♥' : '♡'}</span>{liked ? 'Liked' : 'Like'} <small>{count}</small>
  </button>;
}
