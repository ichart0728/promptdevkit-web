import * as React from 'react';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { useCommentMentionSuggestions } from '../hooks/useCommentMentionSuggestions';
import type { CommentMentionSuggestion } from '../api/commentMentions';

export type CommentMentionsFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  inputId: string;
  workspaceId: string | null;
  disabled?: boolean;
  placeholder?: string;
  ariaDescribedBy?: string;
  maxSelected?: number;
};

type MentionLookup = Record<string, CommentMentionSuggestion>;

const MAX_SELECTED_DEFAULT = 20;

export const CommentMentionsField = <TFieldValues extends FieldValues>({
  control,
  name,
  inputId,
  workspaceId,
  disabled = false,
  placeholder = 'Type @ to search teammates',
  ariaDescribedBy,
  maxSelected = MAX_SELECTED_DEFAULT,
}: CommentMentionsFieldProps<TFieldValues>) => {
  const {
    field: { value, onChange },
  } = useController({ control, name });

  const selectedIds = React.useMemo(
    () => (Array.isArray(value) ? (value as string[]) : []),
    [value],
  );
  const [inputValue, setInputValue] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isFocused, setIsFocused] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const [mentionLookup, setMentionLookup] = React.useState<MentionLookup>({});

  const suggestionsListId = React.useId();
  const optionIdPrefix = `${suggestionsListId}-option`;

  const suggestionsQuery = useCommentMentionSuggestions({
    workspaceId,
    search: searchTerm,
    limit: 10,
    enabled:
      Boolean(workspaceId) && Boolean(searchTerm) && isFocused && selectedIds.length < maxSelected,
  });

  const suggestions = React.useMemo(
    () => suggestionsQuery.data ?? [],
    [suggestionsQuery.data],
  );
  const isLoadingSuggestions = suggestionsQuery.isLoading || suggestionsQuery.isFetching;
  const shouldShowList =
    isFocused &&
    Boolean(workspaceId) &&
    searchTerm.length > 0 &&
    (isLoadingSuggestions || suggestions.length > 0);

  React.useEffect(() => {
    if (!selectedIds.length) {
      setMentionLookup({});
      return;
    }

    setMentionLookup((current) => {
      const next: MentionLookup = {};
      selectedIds.forEach((id) => {
        if (current[id]) {
          next[id] = current[id];
        }
      });
      return next;
    });
  }, [selectedIds]);

  React.useEffect(() => {
    if (!shouldShowList || !suggestions.length) {
      setHighlightedIndex(-1);
      return;
    }

    setHighlightedIndex((current) => {
      if (current >= 0 && current < suggestions.length) {
        return current;
      }
      return 0;
    });
  }, [shouldShowList, suggestions.length]);

  React.useEffect(() => {
    if (!suggestions.length) {
      return;
    }

    setMentionLookup((current) => {
      let hasChanges = false;
      const next: MentionLookup = { ...current };

      suggestions.forEach((suggestion) => {
        if (selectedIds.includes(suggestion.id) && current[suggestion.id]?.name !== suggestion.name) {
          next[suggestion.id] = suggestion;
          hasChanges = true;
        }
      });

      return hasChanges ? next : current;
    });
  }, [selectedIds, suggestions]);

  const handleSelect = React.useCallback(
    (suggestion: CommentMentionSuggestion) => {
      if (selectedIds.includes(suggestion.id)) {
        setInputValue('');
        setSearchTerm('');
        setHighlightedIndex(-1);
        return;
      }

      if (selectedIds.length >= maxSelected) {
        return;
      }

      const next = [...selectedIds, suggestion.id];
      onChange(next);
      setMentionLookup((current) => ({ ...current, [suggestion.id]: suggestion }));
      setInputValue('');
      setSearchTerm('');
      setHighlightedIndex(-1);
    },
    [maxSelected, onChange, selectedIds],
  );

  const handleRemove = React.useCallback(
    (id: string) => {
      const next = selectedIds.filter((item) => item !== id);
      onChange(next);
      setMentionLookup((current) => {
        if (!current[id]) {
          return current;
        }

        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    [onChange, selectedIds],
  );

  const selectHighlighted = React.useCallback(() => {
    if (highlightedIndex < 0 || highlightedIndex >= suggestions.length) {
      return;
    }

    handleSelect(suggestions[highlightedIndex]);
  }, [handleSelect, highlightedIndex, suggestions]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setInputValue(nextValue);

    const normalized = nextValue.startsWith('@') ? nextValue.slice(1) : nextValue;
    setSearchTerm(normalized.trim().toLowerCase());
  };

  const handleInputFocus = () => {
    if (!disabled) {
      setIsFocused(true);
    }
  };

  const handleInputBlur = () => {
    setTimeout(() => {
      setIsFocused(false);
      setHighlightedIndex(-1);
    }, 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!shouldShowList) {
      if (event.key === 'Backspace' && !inputValue && selectedIds.length) {
        const lastId = selectedIds[selectedIds.length - 1];
        handleRemove(lastId);
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => {
        const nextIndex = current + 1;
        if (nextIndex >= suggestions.length) {
          return 0;
        }
        return nextIndex;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => {
        const nextIndex = current - 1;
        if (nextIndex < 0) {
          return suggestions.length - 1;
        }
        return nextIndex;
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      selectHighlighted();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsFocused(false);
      setHighlightedIndex(-1);
      return;
    }
  };

  const activeOptionId =
    highlightedIndex >= 0 && highlightedIndex < suggestions.length
      ? `${optionIdPrefix}-${highlightedIndex}`
      : undefined;

  const isDisabled = disabled || !workspaceId || selectedIds.length >= maxSelected;

  return (
    <div className="space-y-2">
      {selectedIds.length ? (
        <div className="flex flex-wrap gap-2" data-testid="comment-mentions-selected">
          {selectedIds.map((id) => {
            const details = mentionLookup[id];
            const label = details ? `${details.name} (${details.email})` : id;

            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs"
              >
                <span>{details?.name ?? id}</span>
                <button
                  type="button"
                  className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary-foreground/10 hover:text-foreground"
                  onClick={() => handleRemove(id)}
                  aria-label={`Remove mention ${label}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="relative">
        <input
          id={inputId}
          type="text"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          role="combobox"
          aria-expanded={shouldShowList}
          aria-controls={shouldShowList ? suggestionsListId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-describedby={ariaDescribedBy}
        />

        {shouldShowList ? (
          <ul
            id={suggestionsListId}
            role="listbox"
            aria-label="Mention suggestions"
            className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-input bg-popover text-popover-foreground shadow-lg"
          >
            {isLoadingSuggestions ? (
              <li
                className="px-3 py-2 text-sm text-muted-foreground"
                role="option"
                aria-disabled="true"
              >
                Loading suggestions…
              </li>
            ) : null}

            {!isLoadingSuggestions && suggestions.length === 0 ? (
              <li
                className="px-3 py-2 text-sm text-muted-foreground"
                role="option"
                aria-disabled="true"
              >
                No teammates found.
              </li>
            ) : null}

            {suggestions.map((suggestion, index) => {
              const isHighlighted = index === highlightedIndex;
              const optionId = `${optionIdPrefix}-${index}`;

              return (
                <li key={suggestion.id} role="option" id={optionId} aria-selected={isHighlighted}>
                  <button
                    type="button"
                    className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                      isHighlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(suggestion)}
                  >
                    <span className="font-medium">{suggestion.name}</span>
                    <span className="text-xs text-muted-foreground">{suggestion.email}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {!workspaceId ? (
        <p className="text-xs text-muted-foreground">
          Select a workspace to mention teammates.
        </p>
      ) : null}

      {selectedIds.length >= maxSelected ? (
        <p className="text-xs text-muted-foreground">
          You can mention up to {maxSelected} teammates per message.
        </p>
      ) : null}
    </div>
  );
};
