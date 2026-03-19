import { forwardRef, useState } from 'react';

interface Props {
  text: string;
  previewLength?: number;
}

const CollapsibleClassification = forwardRef<HTMLButtonElement, Props>(function CollapsibleClassification(
  { text, previewLength = 12 },
  ref,
) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const needsTruncation = text.length > previewLength;
  const preview = needsTruncation ? `${text.slice(0, previewLength)}…` : text;

  return (
    <button
      ref={ref}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setExpanded(!expanded);
      }}
      className="ml-1 inline text-muted-foreground/50 transition-colors hover:text-muted-foreground/80"
      title={expanded ? 'Recolher' : text}
    >
      <span className="font-body text-[10px] italic">
        ({expanded ? text : preview})
      </span>
    </button>
  );
});

CollapsibleClassification.displayName = 'CollapsibleClassification';

export default CollapsibleClassification;
