export interface TextPart {
    text: string;
    url?: string;
}

const COMMON_TLDS = 'com|org|net|edu|gov|info|biz|io|co|app|dev|cloud|eu|fr|de|es|it|nl|be|ch|at|pt|ru|uk|ca|us';
const LINK_PATTERN = new RegExp(
    String.raw`\b(?:https?:\/\/|www\.|mailto:|tel:)[^\s<>"]+` +
    String.raw`|\b(?:[a-z0-9-]+\.)+(?:${COMMON_TLDS})\b(?![@-])(?:\/[^\s<>"]*)?` +
    String.raw`|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)` +
    String.raw`|((?:\+|\b0)\d[\d ().\/-]{6,}\d)`,
    'gi',
);

const DATE_PATTERN = /\d{1,2}[./-]\d{1,2}[./-]\d{4}/;

function trimTrailingPunctuation(url: string): string {
    const trimmed = url.replace(/[.,;:!?]+$/, '');
    const hasUnbalancedClosingParen = trimmed.endsWith(')') && !trimmed.includes('(');
    return hasUnbalancedClosingParen ? trimTrailingPunctuation(trimmed.slice(0, -1)) : trimmed;
}

function toUrl(linkText: string, email?: string, phone?: string): string | null {
    if (email) return `mailto:${email}`;
    if (phone) {
        const dialNumber = phone.replace(/[^\d+]/g, '');
        const digitCount = dialNumber.replace('+', '').length;
        const looksLikePhone = digitCount >= 9 && digitCount <= 15 && !DATE_PATTERN.test(phone);
        return looksLikePhone ? `tel:${dialNumber}` : null;
    }
    const hasScheme = /^[a-z]+:/i.test(linkText);
    return hasScheme ? linkText : `https://${linkText}`;
}

export function linkify(text: string): TextPart[] {
    const parts: TextPart[] = [];
    let plainTextStart = 0;
    for (const match of text.matchAll(LINK_PATTERN)) {
        const [matchedText, email, phone] = match;
        const linkText = email || phone ? matchedText : trimTrailingPunctuation(matchedText);
        const url = toUrl(linkText, email, phone);
        if (!url) continue;
        if (match.index > plainTextStart) parts.push({text: text.slice(plainTextStart, match.index)});
        parts.push({text: linkText, url});
        plainTextStart = match.index + linkText.length;
    }
    if (plainTextStart < text.length) parts.push({text: text.slice(plainTextStart)});
    return parts;
}
