import { useContext } from "react";
import {
  ThemeContext,
  type ThemeMode,
  type ResolvedTheme,
} from "../contexts/ThemeContext";

interface UseThemeReturn {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
}

export function useTheme(): UseThemeReturn {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
