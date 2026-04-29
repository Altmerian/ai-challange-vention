import { ChevronDownIcon } from "./icons";

export function ExpandButton() {
  return (
    <button
      type="button"
      className="expandButton"
      aria-label="Expand row"
      aria-expanded={false}
      disabled
    >
      <ChevronDownIcon className="expandButton__chevron" width={16} height={16} />
    </button>
  );
}
