/** A large native checkbox in the app's accent colour. */
export function Checkbox({ checked, onChange, id }: { checked: boolean; onChange: (checked: boolean) => void; id?: string }) {
  return (
    <input
      id={id}
      type="checkbox"
      className="size-5 shrink-0 accent-primary"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
