import { useEffect, useState } from 'react';
import { renderAngler } from '../../utils/anglerPaint';
import { lookKey } from '../../utils/anglerLook';

// The strips dressed for a look, or null (stock art) until they're painted — and always null
// where there is no canvas to paint with.
export default function useAnglerSheets(look) {
  const key = lookKey(look || {});
  const [sheets, setSheets] = useState(null);
  useEffect(() => {
    let active = true;
    renderAngler(look).then((painted) => { if (active) setSheets(painted); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return sheets;
}
