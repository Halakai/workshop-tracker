// What the website is built from: the JSON of public.website_snapshot() (served by GET /files/site-data).

export interface PhotoRef {
  id: string;
  favorite: boolean;
}

export type CarStatus = 'bought' | 'in_repair' | 'ready' | 'listed' | 'sold' | 'scrapped';

export interface SiteCar {
  id: string;
  slug: string;
  kind: 'flip' | 'job';
  status: CarStatus | null;
  title_hr: string;
  title_en: string | null;
  summary_hr: string | null;
  summary_en: string | null;
  story_hr: string | null;
  story_en: string | null;
  make: string | null;
  model: string | null;
  generation: string | null;
  year: number | null;
  engine: string | null;
  fuel: string | null;
  mileage_km: number | null;
  price_cents: number | null;
  pinned: boolean;
  /** the gallery, in the order they were added */
  photos: PhotoRef[];
  /** the before/after sliders in the order picked; their photos needn't be in the gallery */
  pairs: { before: string; after: string }[];
}

export interface SiteContact {
  name: string;
  phone: string;
  call: boolean;
  whatsapp: boolean;
  viber: boolean;
}

export interface Snapshot {
  workshop: { name: string; address: string | null; phone: string | null; email: string | null; logo: string | null };
  site: {
    headline_hr: string | null;
    headline_en: string | null;
    intro_hr: string | null;
    intro_en: string | null;
    about_hr: string | null;
    about_en: string | null;
    hours_note_hr: string | null;
    hours_note_en: string | null;
    map_url: string | null;
    instagram_url: string | null;
    facebook_url: string | null;
  };
  site_photos: PhotoRef[];
  contacts: SiteContact[];
  services: { title_hr: string; title_en: string | null; text_hr: string | null; text_en: string | null }[];
  reviews: { author: string; stars: number | null; text_hr: string; text_en: string | null }[];
  hours: { weekday: number; opens: string | null; closes: string | null }[];
  cars: SiteCar[];
}

/** A photo as the build wrote it: sizes for srcset, a big one for the full-screen view and a share picture. */
export interface PhotoFiles {
  width: number;
  height: number;
  src: string;
  srcset: string;
  full: string;
  share: string;
}

export interface BuildContext {
  /** "/workshop-tracker/" */
  base: string;
  /** "https://halakai.github.io" */
  origin: string;
  css: string[];
  js: string;
  /** the workshop logo (from Workshop settings) or the app icon */
  logo: string;
  photos: Record<string, PhotoFiles>;
  /** built from sample data: never indexed, with a banner */
  preview: boolean;
}
