import { useEffect, useState } from 'react';
import { renderAngler } from '../../utils/anglerDraw';
import { lookKey } from '../../utils/anglerLook';

// The strips rendered for a look, or null (stock art) until they're drawn — and always null
// where there is no canvas to draw with.
export default function useAnglerSheets(look) {
  const key = lookKey(look || {});
  const [sheets, setSheets] = useState(null);
  useEffect(() => {
    let active = true;
    renderAngler(look).then((drawn) => { if (active) setSheets(drawn); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return sheets;
}
