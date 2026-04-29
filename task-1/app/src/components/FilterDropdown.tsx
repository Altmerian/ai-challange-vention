import { useEffect, useId, useRef, useState } from "react";
import type { FilterOption } from "../utils/filterOptions";
import { ChevronDownIcon } from "./icons";

type FilterDropdownProps<T extends string | number | undefined> = {
  label: string;
  placeholder: string;
  options: FilterOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
};

const findSelectedIndex = <T extends string | number | undefined>(
  options: FilterOption<T>[],
  value: T | undefined,
): number => options.findIndex((option) => Object.is(option.value, value));

export function FilterDropdown<T extends string | number | undefined>({
  label,
  placeholder,
  options,
  value,
  onChange,
}: FilterDropdownProps<T>) {
  const dropdownId = useId();
  const listboxId = `${dropdownId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIndex = findSelectedIndex(options, value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const triggerLabel = selectedOption?.label ?? placeholder;

  const openListbox = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  };

  const closeListbox = (restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeListbox(true);
  };

  const moveActiveOption = (step: 1 | -1) => {
    setActiveIndex((current) => {
      const next = current + step;
      if (next < 0) return options.length - 1;
      if (next >= options.length) return 0;
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeListbox();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div className="filterDropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="filterDropdown__trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? `${listboxId}-option-${activeIndex}` : undefined}
        onClick={() => {
          if (isOpen) {
            closeListbox();
          } else {
            openListbox();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeListbox(true);
            return;
          }

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) {
              openListbox();
              return;
            }
            moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
            return;
          }

          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!isOpen) {
              openListbox();
              return;
            }
            selectOption(activeIndex);
          }
        }}
      >
        <span className="filterDropdown__label">{triggerLabel}</span>
        <ChevronDownIcon width={14} height={14} />
      </button>
      {isOpen ? (
        <div className="filterDropdown__listbox" id={listboxId} role="listbox">
          {options.map((option, index) => (
            <button
              key={`${String(option.value)}-${option.label}`}
              id={`${listboxId}-option-${index}`}
              type="button"
              className={
                index === activeIndex
                  ? "filterDropdown__option filterDropdown__option--active"
                  : "filterDropdown__option"
              }
              role="option"
              aria-selected={Object.is(option.value, value)}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(index)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
