const formatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  // The same day on the server and in every browser
  timeZone: 'UTC',
});

/** A post's date, such as "2 October 2026" */
export function formatDate(iso: string) {
  return formatter.format(new Date(iso));
}
