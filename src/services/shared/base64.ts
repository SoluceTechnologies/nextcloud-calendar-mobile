export function utf8ToBase64(input: string): string {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export function base64ToUtf8(b64: string): string {
    return new TextDecoder().decode(base64ToBytes(b64));
}
