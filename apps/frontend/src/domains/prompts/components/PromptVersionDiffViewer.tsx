import * as React from 'react';

import type { PromptVersion } from '../api/promptVersions';
import type { DiffLine } from './promptVersionDiff';
import { computeLineDiff } from './promptVersionDiff';

export type PromptVersionDiffViewerProps = {
  currentVersion: PromptVersion;
  previousVersion: PromptVersion | null;
};

const formatTags = (tags: string[]) => tags.join(', ');

const lineClassByType: Record<DiffLine['type'], string> = {
  added: 'bg-emerald-50 text-emerald-900',
  removed: 'bg-rose-50 text-rose-900',
  unchanged: 'text-muted-foreground',
};

const prefixByType: Record<DiffLine['type'], string> = {
  added: '+',
  removed: '−',
  unchanged: '·',
};

export const PromptVersionDiffViewer = ({
  currentVersion,
  previousVersion,
}: PromptVersionDiffViewerProps) => {
  const fieldDiffs = React.useMemo(
    () => [
      {
        key: 'title',
        label: 'Title',
        previousValue: previousVersion?.title ?? '',
        currentValue: currentVersion.title,
      },
      {
        key: 'body',
        label: 'Prompt body',
        previousValue: previousVersion?.body ?? '',
        currentValue: currentVersion.body,
      },
      {
        key: 'note',
        label: 'Internal note',
        previousValue: previousVersion?.note ?? '',
        currentValue: currentVersion.note ?? '',
      },
      {
        key: 'tags',
        label: 'Tags',
        previousValue: previousVersion ? formatTags(previousVersion.tags) : '',
        currentValue: formatTags(currentVersion.tags),
      },
    ],
    [currentVersion, previousVersion],
  );

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Version {currentVersion.version}</h3>
        <p className="text-xs text-muted-foreground">
          {previousVersion
            ? `Comparing with version ${previousVersion.version}.`
            : 'No previous version available. Showing full content.'}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
          <span className="text-emerald-700">+ Added</span>
          <span className="text-rose-700">− Removed</span>
          <span>· Unchanged</span>
        </div>
      </div>

      {fieldDiffs.map((field) => {
        const diffLines = computeLineDiff(field.previousValue, field.currentValue);
        const hasLines = diffLines.length > 0;
        const hasChanges = diffLines.some((line) => line.type !== 'unchanged');

        return (
          <section
            key={field.key}
            aria-label={`${field.label} diff`}
            role="region"
            className="space-y-2 rounded-md border border-border bg-card p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">{field.label}</h4>
              {hasLines && !hasChanges ? (
                <span className="text-[11px] uppercase text-muted-foreground">No changes</span>
              ) : null}
            </div>

            {hasLines ? (
              <div className="space-y-1">
                {diffLines.map((line, index) => (
                  <div
                    key={`${field.key}-${index}-${line.type}-${line.value}`}
                    className={`grid grid-cols-[16px,1fr] gap-3 rounded-sm px-2 py-1 text-xs font-mono ${lineClassByType[line.type]}`}
                  >
                    <span aria-hidden="true">{prefixByType[line.type]}</span>
                    <span className="whitespace-pre-wrap">
                      {line.value === '' ? '\u00A0' : line.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No content.</p>
            )}
          </section>
        );
      })}
    </div>
  );
};

