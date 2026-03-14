import { useState } from 'react';

interface Props {
  text: string;
  previewLength?: number;
}

/**
 * Shows a classification label collapsed by default:
 * "(assentam…)" expands to "(assentamento de tubos)" on click.
 */
export default function CollapsibleClassification({ text, previewLength = 12 }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  const needsTruncation = text.length > previewLength;
  const preview = needsTruncation ? text.slice(0, previewLength) + '…' : text;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
      className="text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors inline ml-1"
      title={expanded ? 'Recolher' : text}
    >
      <span className="italic text-[10px] font-body">
        ({expanded ? text : preview})
      </span>
    </button>
  );
}
