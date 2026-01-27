import * as React from "react";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list";

interface ViewToggleProps {
  /** Current view mode */
  viewMode: ViewMode;
  /** Callback when view mode changes */
  onViewModeChange: (mode: ViewMode) => void;
  /** ID of the label element for aria-labelledby */
  ariaLabelledBy?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Grid/List view toggle button group.
 *
 * Implements ARIA radiogroup pattern for accessibility:
 * - role="radiogroup" on container
 * - role="radio" + aria-checked on each button
 * - Keyboard navigation with arrow keys
 */
export function ViewToggle({
  viewMode,
  onViewModeChange,
  ariaLabelledBy,
  className,
}: ViewToggleProps): React.JSX.Element {
  const handleKeyDown = (
    event: React.KeyboardEvent,
    currentMode: ViewMode,
  ): void => {
    const modes: ViewMode[] = ["grid", "list"];
    const currentIndex = modes.indexOf(currentMode);

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const newIndex = currentIndex === 0 ? modes.length - 1 : currentIndex - 1;
      const newMode = modes[newIndex];
      if (newMode !== undefined) {
        onViewModeChange(newMode);
      }
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const newIndex = currentIndex === modes.length - 1 ? 0 : currentIndex + 1;
      const newMode = modes[newIndex];
      if (newMode !== undefined) {
        onViewModeChange(newMode);
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
      className={cn("inline-flex rounded-md border bg-muted p-1", className)}
    >
      <Button
        type="button"
        role="radio"
        aria-checked={viewMode === "grid"}
        aria-label="Grid view"
        variant={viewMode === "grid" ? "default" : "ghost"}
        size="sm"
        className={cn(
          "h-8 px-2.5",
          viewMode === "grid" ? "" : "hover:bg-background",
        )}
        onClick={() => onViewModeChange("grid")}
        onKeyDown={(e) => handleKeyDown(e, "grid")}
        tabIndex={viewMode === "grid" ? 0 : -1}
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="sr-only">Grid view</span>
      </Button>
      <Button
        type="button"
        role="radio"
        aria-checked={viewMode === "list"}
        aria-label="List view"
        variant={viewMode === "list" ? "default" : "ghost"}
        size="sm"
        className={cn(
          "h-8 px-2.5",
          viewMode === "list" ? "" : "hover:bg-background",
        )}
        onClick={() => onViewModeChange("list")}
        onKeyDown={(e) => handleKeyDown(e, "list")}
        tabIndex={viewMode === "list" ? 0 : -1}
      >
        <List className="h-4 w-4" />
        <span className="sr-only">List view</span>
      </Button>
    </div>
  );
}
