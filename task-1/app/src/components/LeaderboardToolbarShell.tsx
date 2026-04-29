import { ChevronDownIcon, SearchIcon } from "./icons";

const filterPlaceholders = [
  { id: "year", label: "Year" },
  { id: "quarter", label: "Quarter" },
  { id: "category", label: "Category" },
];

export function LeaderboardToolbarShell() {
  return (
    <div className="toolbarShell" data-placeholder="story-1.5">
      <div className="toolbarShell__filters">
        {filterPlaceholders.map((filter) => (
          <div key={filter.id} className="toolbarShell__filter" aria-disabled>
            <span className="toolbarShell__filterLabel">{filter.label}</span>
            <ChevronDownIcon width={14} height={14} />
          </div>
        ))}
      </div>
      <div className="toolbarShell__search">
        <SearchIcon width={16} height={16} className="toolbarShell__searchIcon" />
        <input
          type="search"
          className="toolbarShell__searchInput"
          placeholder="Search employee..."
          aria-label="Search employee"
          disabled
        />
      </div>
    </div>
  );
}
