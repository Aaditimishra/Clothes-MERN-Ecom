import { useState } from 'react';

/**
 * Page and page-size, held together.
 *
 * They belong together because changing one has to reset the other: asking for
 * 100 rows while sitting on page 6 of a 10-row listing lands you past the end
 * of the data, and the screen goes blank with a pager that says you are on a
 * page that does not exist. Every list made that mistake separately, so the
 * reset lives here once.
 *
 * The same applies to a filter or a search term — `reset()` is what those call.
 */
export const usePaging = (initialSize = 25) => {
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(initialSize);

  return {
    page,
    pageSize,
    setPage,
    setPageSize: (size: number) => {
      setSize(size);
      setPage(1);
    },
    /** Call when a filter changes — the old page number means nothing now. */
    reset: () => setPage(1),
  };
};
