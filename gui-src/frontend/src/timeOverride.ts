/**
 * Time override — monkey-patches the global Date so that `new Date()` and
 * `Date.now()` return a simulated time when CURRENT_TIME is configured on
 * the backend.
 *
 * Call `initTimeOverride()` **once**, before React mounts. It fetches
 * `./api/time` and, if an override is active, replaces the global `Date`
 * with a subclass that applies a fixed millisecond offset. All existing
 * app code (`new Date()`, `Date.now()`) automatically gets the right time
 * with zero per-app changes.
 *
 * When a timezone offset is present in CURRENT_TIME (e.g. "-05:00"), the
 * locale formatting methods (toLocaleString, toLocaleDateString,
 * toLocaleTimeString) are patched to default to that timezone instead of
 * the browser's local timezone. Apps that explicitly pass a `timeZone`
 * option are unaffected.
 *
 * When no override is active this module is a no-op.
 */

const OriginalDate = globalThis.Date;

let _overrideTimeZone: string | null = null;

// ============================================================================
// Public API — timezone utilities
// ============================================================================

/**
 * Returns the IANA timezone derived from CURRENT_TIME's offset (e.g. "Etc/GMT+5"
 * for offset "-05:00"), or null when no override is active.
 */
export function getOverrideTimeZone(): string | null {
  return _overrideTimeZone;
}

/**
 * Returns the timezone that should be used for display throughout the GUI:
 * the CURRENT_TIME timezone when set, otherwise the browser's local timezone.
 *
 * Unlike `getOverrideTimeZone()` this never returns null, so callers don't
 * need a fallback.
 */
export function getDisplayTimeZone(): string {
  return _overrideTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Return the current wall-clock time in the given IANA timezone as a Date
 * whose getHours()/getMinutes()/etc. reflect that timezone.
 */
export function getNowInTimeZone(tz: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value || "0");
  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/**
 * Convert a wall-clock Date from one IANA timezone to another.
 *
 * The input Date's getHours()/getMinutes() represent wall-clock time in
 * `fromTz`.  Returns a new Date whose local accessors give the equivalent
 * wall-clock moment in `toTz`.
 */
export function convertWallClockTimezone(
  date: Date,
  fromTz: string,
  toTz: string,
): Date {
  if (fromTz === toTz) return date;

  const intlOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };

  // What wall-clock does fromTz show at date's internal UTC instant?
  const fromParts = new Intl.DateTimeFormat("en-US", {
    ...intlOpts,
    timeZone: fromTz,
  }).formatToParts(date);
  const getFrom = (type: string) =>
    parseInt(fromParts.find((p) => p.type === type)?.value || "0");
  const fromWallClock = new Date(
    getFrom("year"),
    getFrom("month") - 1,
    getFrom("day"),
    getFrom("hour"),
    getFrom("minute"),
    getFrom("second"),
  );

  // Shift so that the UTC instant truly corresponds to the desired wall-clock
  // in fromTz
  const correctedUtc = new Date(
    date.getTime() + (date.getTime() - fromWallClock.getTime()),
  );

  // Read the wall-clock in toTz at the corrected UTC instant
  const toParts = new Intl.DateTimeFormat("en-US", {
    ...intlOpts,
    timeZone: toTz,
  }).formatToParts(correctedUtc);
  const getTo = (type: string) =>
    parseInt(toParts.find((p) => p.type === type)?.value || "0");
  return new Date(
    getTo("year"),
    getTo("month") - 1,
    getTo("day"),
    getTo("hour"),
    getTo("minute"),
    getTo("second"),
  );
}

// ============================================================================
// Internal helpers
// ============================================================================

function offsetToIANA(offset: string): string | null {
  const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, sign, h, m] = match;
  const hours = parseInt(h);
  const minutes = parseInt(m);
  if (minutes !== 0) return null; // Etc/GMT only supports whole-hour offsets
  if (hours === 0) return "UTC";
  // Etc/GMT uses INVERTED signs: UTC-5 → Etc/GMT+5
  return `Etc/GMT${sign === "-" ? "+" : "-"}${hours}`;
}

/**
 * Patch toLocaleString / toLocaleDateString / toLocaleTimeString so that
 * calls without an explicit `timeZone` option default to the CURRENT_TIME
 * timezone instead of the browser's local timezone.
 */
function patchLocaleMethods(tz: string): void {
  const proto = OriginalDate.prototype;

  const origToLocaleString = proto.toLocaleString;
  const origToLocaleDateString = proto.toLocaleDateString;
  const origToLocaleTimeString = proto.toLocaleTimeString;

  function withTimeZone(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    original: (...args: any[]) => string,
    self: Date,
    args: unknown[],
  ): string {
    const optsIndex = args.length >= 2 ? 1 : args.length === 1 ? 1 : 0;
    const existing = args[optsIndex] as Intl.DateTimeFormatOptions | undefined;

    // Only inject when no timeZone is explicitly provided
    if (existing && typeof existing === "object" && "timeZone" in existing) {
      return original.apply(self, args as Parameters<typeof original>);
    }

    const newArgs = [...args];
    if (optsIndex === 0 && args.length === 0) {
      // No arguments at all: toLocaleString()
      newArgs.push(undefined, { timeZone: tz });
    } else if (optsIndex === 1 && args.length === 1) {
      // Only locale: toLocaleString('en-US')
      newArgs.push({ timeZone: tz });
    } else {
      // Has options but no timeZone: toLocaleString('en-US', { hour: ... })
      newArgs[optsIndex] = { ...(existing as object), timeZone: tz };
    }

    return original.apply(self, newArgs as Parameters<typeof original>);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.toLocaleString = function (...args: any[]) {
    return withTimeZone(origToLocaleString, this, args);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.toLocaleDateString = function (...args: any[]) {
    return withTimeZone(origToLocaleDateString, this, args);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.toLocaleTimeString = function (...args: any[]) {
    return withTimeZone(origToLocaleTimeString, this, args);
  };
}

// ============================================================================
// Initialisation (call once before React mounts)
// ============================================================================

export async function initTimeOverride(): Promise<void> {
  try {
    const res = await fetch("./api/time");
    if (!res.ok) return;

    const data = await res.json();
    if (!data.is_overridden) return;

    if (data.timezone_offset) {
      _overrideTimeZone = offsetToIANA(data.timezone_offset);
    }

    const serverTime = new OriginalDate(data.current_time).getTime();
    const clientTime = OriginalDate.now();
    const offsetMs = serverTime - clientTime;

    // Nothing meaningful to patch
    if (Math.abs(offsetMs) < 1000) return;

    // Build a patched Date class that shifts no-arg construction and now()
    const PatchedDate = function (this: Date, ...args: unknown[]) {
      if (!(this instanceof PatchedDate)) {
        // Called without `new` — Date() returns a string in the spec
        return new PatchedDate().toString();
      }
      if (args.length === 0) {
        return new OriginalDate(OriginalDate.now() + offsetMs);
      }
      // @ts-expect-error – forwarding arbitrary ctor signatures
      return new OriginalDate(...args);
    } as unknown as DateConstructor;

    // Carry over all static methods and properties
    Object.setPrototypeOf(PatchedDate, OriginalDate);
    Object.defineProperty(PatchedDate, "prototype", {
      value: OriginalDate.prototype,
      writable: false,
    });

    // Override Date.now()
    PatchedDate.now = function () {
      return OriginalDate.now() + offsetMs;
    };

    // Keep parse and UTC from original
    PatchedDate.parse = OriginalDate.parse;
    PatchedDate.UTC = OriginalDate.UTC;

    globalThis.Date = PatchedDate;

    // Patch locale formatting methods to use the override timezone
    if (_overrideTimeZone) {
      patchLocaleMethods(_overrideTimeZone);
    }

    console.info(
      `[time-override] Active — offset ${offsetMs > 0 ? "+" : ""}${Math.round(offsetMs / 1000)}s` +
        (_overrideTimeZone ? `, timezone ${_overrideTimeZone}` : ""),
    );
  } catch {
    // Backend unreachable — proceed with real time
  }
}
