import { SearchIcon } from "./icons";

type SearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBox({ value, onChange }: SearchBoxProps) {
  return (
    <div className="toolbarShell__search">
      <SearchIcon width={16} height={16} className="toolbarShell__searchIcon" />
      <input
        type="search"
        role="searchbox"
        className="toolbarShell__searchInput"
        placeholder="Search employee..."
        aria-label="Search employee"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}
