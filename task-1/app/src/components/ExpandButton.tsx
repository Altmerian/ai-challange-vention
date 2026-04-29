import { ChevronDownIcon, ChevronUpIcon } from "./icons";

type ExpandButtonProps = {
  employeeName: string;
  detailsId: string;
  isExpanded: boolean;
  onToggle: () => void;
};

export function ExpandButton({
  employeeName,
  detailsId,
  isExpanded,
  onToggle,
}: ExpandButtonProps) {
  const label = isExpanded
    ? `Collapse activity details for ${employeeName}`
    : `Expand activity details for ${employeeName}`;
  const Icon = isExpanded ? ChevronUpIcon : ChevronDownIcon;

  return (
    <button
      type="button"
      className="expandButton"
      aria-label={label}
      aria-expanded={isExpanded}
      aria-controls={detailsId}
      onClick={onToggle}
    >
      <Icon className="expandButton__chevron" width={16} height={16} />
    </button>
  );
}
