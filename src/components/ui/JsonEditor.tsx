import React, { useState, useEffect, useRef, useCallback } from "react";
import { Textarea } from "./textarea";
import { Button } from "./button";
import { Label } from "./label";
import { Check, X, AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Validates a JSON string and returns detailed error information.
 */
function validateJSON(str: string): { valid: boolean; error?: string } {
  if (!str.trim()) return { valid: true };
  try {
    JSON.parse(str);
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : "Invalid JSON",
    };
  }
}

/**
 * Formats a JSON string with 2-space indentation.
 */
function formatJSON(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

interface JsonEditorProps {
  /** Unique ID for the textarea element */
  id: string;
  /** Name attribute for the textarea */
  name: string;
  /** Label text displayed above the editor */
  label: string;
  /** Current JSON string value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when validity state changes */
  onValidityChange?: (isValid: boolean) => void;
  /** Placeholder text shown when empty */
  placeholder?: string;
  /** Help text displayed below the editor */
  helpText?: string;
  /** Number of visible text rows */
  rows?: number;
  /** Additional CSS classes */
  className?: string;
  /** Whether the editor is disabled */
  disabled?: boolean;
}

/**
 * A JSON editor component with live validation, auto-completion, and formatting.
 *
 * Features:
 * - Live JSON validation with visual status indicator
 * - Auto-completion for braces, brackets, and quotes
 * - Format JSON button for pretty-printing
 * - Full ARIA accessibility support
 */
export function JsonEditor({
  id,
  name,
  label,
  value,
  onChange,
  onValidityChange,
  placeholder = '{"key": "value"}',
  helpText,
  rows = 4,
  className,
  disabled = false,
}: JsonEditorProps): React.JSX.Element {
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
  }>({ valid: true });
  const [isDirty, setIsDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const statusId = `${id}-status`;
  const helpId = `${id}-help`;

  // Debounced validation
  const validateInput = useCallback((input: string) => {
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    validationTimeoutRef.current = setTimeout(() => {
      const result = validateJSON(input);
      setValidationResult(result);
    }, 300);
  }, []);

  // Validate on value change
  useEffect(() => {
    if (isDirty || value.trim()) {
      validateInput(value);
    }
    return (): void => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [value, isDirty, validateInput]);

  // Notify parent of validity changes
  useEffect(() => {
    onValidityChange?.(validationResult.valid);
  }, [validationResult.valid, onValidityChange]);

  // Auto-completion pairs
  const autoCompletePairs: Record<string, string> = {
    "{": "}",
    "[": "]",
    '"': '"',
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const target = e.currentTarget;
    const selectionStart = target.selectionStart;
    const selectionEnd = target.selectionEnd;

    // Guard against null selection indices
    if (selectionStart === null || selectionEnd === null) return;

    // Handle auto-completion
    if (autoCompletePairs[e.key] && selectionStart === selectionEnd) {
      e.preventDefault();
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const closingChar = autoCompletePairs[e.key];
      const newValue = `${before}${e.key}${closingChar}${after}`;
      onChange(newValue);

      // Move cursor between the pair
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = selectionStart + 1;
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
        }
      });
    }

    // Handle backspace to delete pairs
    if (
      e.key === "Backspace" &&
      selectionStart === selectionEnd &&
      selectionStart > 0
    ) {
      const charBefore = value[selectionStart - 1];
      const charAfter = value[selectionStart];

      if (
        charBefore !== undefined &&
        autoCompletePairs[charBefore] === charAfter
      ) {
        e.preventDefault();
        const before = value.slice(0, selectionStart - 1);
        const after = value.slice(selectionStart + 1);
        onChange(`${before}${after}`);

        requestAnimationFrame(() => {
          if (textareaRef.current) {
            const newPos = selectionStart - 1;
            textareaRef.current.selectionStart = newPos;
            textareaRef.current.selectionEnd = newPos;
          }
        });
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setIsDirty(true);
    onChange(e.target.value);
  };

  const handleFormat = (): void => {
    if (validationResult.valid && value.trim()) {
      const formatted = formatJSON(value);
      onChange(formatted);
    }
  };

  const showValidation = isDirty || value.trim().length > 0;
  const isInvalid = showValidation && !validationResult.valid;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleFormat}
          disabled={disabled || !validationResult.valid || !value.trim()}
          className="h-7 px-2 text-xs"
          aria-label="Format JSON"
        >
          <AlignLeft className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Format
        </Button>
      </div>

      <Textarea
        ref={textareaRef}
        id={id}
        name={name}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn(
          "font-mono text-sm",
          isInvalid && "border-destructive focus-visible:ring-destructive",
        )}
        aria-invalid={isInvalid}
        aria-describedby={`${statusId} ${helpText ? helpId : ""}`.trim()}
      />

      {/* Validation Status */}
      <div
        id={statusId}
        className="flex items-center gap-1.5 text-xs"
        aria-live="polite"
        aria-atomic="true"
      >
        {showValidation &&
          (validationResult.valid ? (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Valid JSON</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-destructive">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Invalid JSON</span>
            </span>
          ))}
      </div>

      {/* Help Text */}
      {helpText && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {helpText}
        </p>
      )}
    </div>
  );
}
