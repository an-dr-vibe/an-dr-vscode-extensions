export function getNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => {
    const characterIndex = Math.trunc(Math.random() * alphabet.length);
    return alphabet[characterIndex];
  }).join("");
}
