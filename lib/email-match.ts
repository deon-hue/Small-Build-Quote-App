// Escapes the characters that mean something in a SQL LIKE pattern (% _ and the backslash itself), so an email address such as
// "john_smith@example.com" is matched exactly when used with .ilike() to compare emails regardless of capital letters.
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => '\\' + m)
}
