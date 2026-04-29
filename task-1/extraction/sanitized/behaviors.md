# Leaderboard Behavior Notes

## Root And Data

- Widget root selector: `section[class^="leaderboard_"]`.
- Main data source: `/sites/edu/Shared%20Documents/EDU%20LeaderBoard/LeaderBoardData25_Final%209.csv`.
- CSV columns: `ActivityExternalId`, `EmployeeName`, `EmployeeTitle`, `EmployeeUnit`, `ActivityEndDate`, `Email`, `ActivityCategory`, `Employee GUID`, `ActivityPoints`, `ActivityTitle`.
- Implementation target CSV scale: about 450 synthetic activity records.
- Implementation target rendered scale: about 200 synthetic employees.
- React data model should group CSV rows by employee identity, keep employee display fields from the grouped rows, sum `ActivityPoints` for total score, and derive per-category counts/rows from `ActivityCategory`.

## Dropdowns

- All three filters are custom Fluent UI dropdowns: `role="combobox"` trigger plus `role="listbox"` popup, not native `<select>`.
- Years dropdown: 2 options. Selecting the second option kept the rendered employee list populated. No data/network request fired.
- Quarters dropdown: 5 options. Selecting the second option reduced rendered employees to 56. No data/network request fired.
- Categories dropdown: 4 observed source options, with `All Categories` as the first/default option. Selecting the second option reduced rendered employees to 125. No data/network request fired.
- Open popups had `transitionDuration: 0s` and `animationDuration: 0s`; no visible animation timing was detected.
- Sanitized listbox DOM files: `dropdown-years.html`, `dropdown-quarters.html`, `dropdown-categories.html`.

## Search

- Search input is inside the leaderboard root and has `role="searchbox"`.
- Search is client-side. A rare query reduced the rendered employee list to 0 and fired no network requests after the page was idle.
- No debounce-backed API call was detected. Filtering appears local against already loaded data.

## Rows

- Rows are rendered as card-like containers with one circular avatar, rank, employee name/title, category stat icons, total score, and a circular expand button.
- The only buttons inside the list are row expand buttons.
- Expanding a row reveals a details section with an activity table.
- Expanded detail fields/classes observed: `detailsTitle`, `activityTable`, `activityName`, `categoryBadge`, `activityDate`, `activityPoints`.
- Expanded row switches chevron from `ChevronDown` to `ChevronUp`.
- Expanded details had `transitionDuration: 0s`, `animationDuration: 0s`, and visible overflow; no animated height transition was detected.
- Sanitized expanded row DOM: `row-expanded.html`.

## Sort And Pagination

- No `aria-sort`, `role="columnheader"`, table header, or sort-like control was found inside the leaderboard widget.
- Scores in the rendered list are already in descending order.
- No load-more, next/previous, pagination control, or infinite-scroll trigger was detected.
- The page renders the full employee list for the current filters.

## Icons

- Observed icon names: `Search`, `ChevronDown`, `ChevronUp`, `FavoriteStarFill`, `Presentation`, `Education`, `Emoji2`.
- `FavoriteStarFill` is used for score pills/totals.
- Category stat icons include `Presentation`, `Education`, and `Emoji2`.
