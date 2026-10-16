import { forwardRef, useEffect, useRef } from 'react';

// A message box that grows with what you type (up to about six lines), like a text message
const AutoGrow = forwardRef(function AutoGrow({ value, maxHeight = 168, ...props }, outerRef) {
  const innerRef = useRef(null);
  const ref = outerRef || innerRef;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight + 2, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight + 2 > maxHeight ? 'auto' : 'hidden';
  }, [value, maxHeight, ref]);
  return <textarea ref={ref} rows={1} value={value} {...props} />;
});

export default AutoGrow;
