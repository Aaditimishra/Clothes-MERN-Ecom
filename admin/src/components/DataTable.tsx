import { useEffect, useState, type ReactNode } from 'react';

/**
 * One table, described as data.
 *
 * Every list screen had its own hand-written `<thead>`/`<tbody>` pair, so a
 * column was five edits in two places and the screens had already drifted —
 * different padding, different empty markers, one that truncated and one that
 * did not. Describing columns instead means a screen says WHAT it shows and
 * this says how a table looks, once.
 *
 * It also makes the columns a merchant's choice rather than a developer's,
 * which is the point: someone reconciling payments wants the UTR and does not
 * care about the city, and the person packing wants the opposite.
 */
export interface Column<T> {
  /** Stable key. Used for the visibility preference, so do not rename lightly. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Right-aligns and uses tabular figures — for money and counts. */
  numeric?: boolean;
  /** Shrinks to content and never wraps — for a row's action buttons. */
  tight?: boolean;
  /** Kept out of the column picker: without it the row cannot be acted on. */
  required?: boolean;
  /** Hidden until someone turns it on. For the detail nobody needs by default. */
  optional?: boolean;
  width?: string;
}

const readHidden = (storageKey: string): Set<string> => {
  try {
    const raw = localStorage.getItem(storageKey);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
};

/**
 * The column picker.
 *
 * Stores the HIDDEN set rather than the visible one, for the same reason the
 * nav stores its folded groups: a column added later then appears by default
 * instead of being silently withheld from everyone who used the screen before.
 */
const ColumnPicker = <T,>({
  columns,
  hidden,
  onToggle,
  onReset,
}: {
  columns: Column<T>[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.columns')) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const changeable = columns.filter((column) => !column.required);
  const hiddenCount = changeable.filter((column) => hidden.has(column.key)).length;

  return (
    <div className="columns">
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Columns
        {hiddenCount > 0 ? <span className="columns-count">{changeable.length - hiddenCount}</span> : null}
      </button>

      {open ? (
        <div className="columns-menu" role="menu">
          <p className="columns-title">Show</p>
          {changeable.map((column) => (
            <label key={column.key} className="columns-item">
              <input
                type="checkbox"
                checked={!hidden.has(column.key)}
                onChange={() => onToggle(column.key)}
              />
              {column.header}
            </label>
          ))}
          <button type="button" className="columns-reset" onClick={onReset}>
            Reset to default
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const DataTable = <T,>({
  columns,
  rows,
  rowKey,
  storageKey,
  onRowClick,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Where this screen's column choices live. Omit for a fixed table. */
  storageKey?: string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}) => {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const stored = storageKey ? readHidden(storageKey) : new Set<string>();
    // Optional columns start hidden, unless this browser has said otherwise.
    if (!storageKey || localStorage.getItem(storageKey) === null) {
      for (const column of columns) if (column.optional) stored.add(column.key);
    }
    return stored;
  });

  const persist = (next: Set<string>) => {
    setHidden(next);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // The choice holds for this session; it just will not be remembered.
    }
  };

  const visible = columns.filter((column) => !hidden.has(column.key));

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <>
      {storageKey ? (
        <div className="table-toolbar">
          <ColumnPicker
            columns={columns}
            hidden={hidden}
            onToggle={(key) => {
              const next = new Set(hidden);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              persist(next);
            }}
            onReset={() => {
              const next = new Set<string>();
              for (const column of columns) if (column.optional) next.add(column.key);
              persist(next);
            }}
          />
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {visible.map((column) => (
                <th
                  key={column.key}
                  className={[column.numeric ? 'num' : '', column.tight ? 'tight' : '']
                    .filter(Boolean)
                    .join(' ')}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'is-clickable' : ''}
                onClick={
                  onRowClick
                    ? (event) => {
                        /*
                          A click on a button inside the row is that button's,
                          not the row's. Without this, "Remove" opens the detail
                          dialog behind the confirmation.
                        */
                        if ((event.target as HTMLElement).closest('button, a, input, select')) return;
                        onRowClick(row);
                      }
                    : undefined
                }
              >
                {visible.map((column) => (
                  <td
                    key={column.key}
                    className={[column.numeric ? 'num' : '', column.tight ? 'tight' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};
