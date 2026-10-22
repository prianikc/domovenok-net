/** Строка в одинарных кавычках POSIX shell: безопасна как один аргумент. */
export function shq(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}
