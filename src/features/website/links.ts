/** The public website's address. The app lives in <website>/app/, so it is the app's address without "app/". */
export function websiteBase(): string {
  return new URL(import.meta.env.BASE_URL.replace(/app\/$/, ''), window.location.origin).href;
}
