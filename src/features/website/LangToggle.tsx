import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type Lang = 'hr' | 'en';

const itemClass = 'px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

/** Which language's texts a website form shows (both are kept while switching). */
export function LangToggle({ value, onChange }: { value: Lang; onChange: (lang: Lang) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && onChange(v as Lang)}>
      <ToggleGroupItem value="hr" className={itemClass}>
        Hrvatski
      </ToggleGroupItem>
      <ToggleGroupItem value="en" className={itemClass}>
        English
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
