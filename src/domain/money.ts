/**
 * All financial amounts are stored and calculated as integer paise.
 * Legacy records stored rupees as JS numbers; they are converted on read
 * with rupeesToPaise and are never rewritten in place.
 */
export type Paise = number;

export const isValidPaise = (value: unknown): value is Paise =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export const rupeesToPaise = (rupees: number): Paise => {
    if (typeof rupees !== "number" || !Number.isFinite(rupees)) {
        throw new Error(`Invalid rupee amount: ${String(rupees)}`);
    }
    return Math.round(rupees * 100);
};

export const paiseToRupees = (paise: Paise): number => paise / 100;

/**
 * Parses user input such as "1000", "1,000.5" or "999.99" into paise without
 * floating point arithmetic. Returns null for anything that is not a valid
 * non-negative amount with at most two decimals.
 */
export const parseRupeeInput = (text: string): Paise | null => {
    const cleaned = text.replace(/[,\s₹]/g, "");
    const match = /^(\d{1,9})(?:\.(\d{0,2}))?$/.exec(cleaned);
    if (!match) {
        return null;
    }
    const whole = Number(match[1]);
    const fraction = Number((match[2] ?? "").padEnd(2, "0"));
    return whole * 100 + fraction;
};

const groupIndian = (digits: string): string => {
    if (digits.length <= 3) {
        return digits;
    }
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    return `${rest},${last3}`;
};

/** Formats paise as ₹1,23,456.00 independent of device locale support. */
export const formatPaise = (paise: Paise, options: { decimals?: boolean } = {}): string => {
    const negative = paise < 0;
    const abs = Math.abs(Math.round(paise));
    const rupees = Math.floor(abs / 100);
    const fraction = String(abs % 100).padStart(2, "0");
    const showDecimals = options.decimals ?? true;
    const body = groupIndian(String(rupees)) + (showDecimals ? `.${fraction}` : "");
    return `${negative ? "-" : ""}₹${body}`;
};

/** Plain number string for CSV cells, e.g. "1200.00". */
export const paiseToPlain = (paise: Paise): string => {
    const negative = paise < 0;
    const abs = Math.abs(Math.round(paise));
    return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};
