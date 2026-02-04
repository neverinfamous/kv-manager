import { useContext } from "react";
import {
  ThemeContext,
  type ThemeContextType,
  type ThemeMode,
  type ResolvedTheme,
} from "../contexts/theme-context-types";

/**
 * Hook to access the theme context.
 * Must be used within a ThemeProvider.
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Re-export types for convenience
export type { ThemeMode, ResolvedTheme };
