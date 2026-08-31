import { useEffect, useState } from "react";
import { getAttachmentSignedUrl } from "@/lib/uploadAttachment";

export function AttachmentThumb({ stored }: { stored: string | null | undefined }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!stored) { setUrl(null); return; }
    getAttachmentSignedUrl(stored).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [stored]);
  if (!stored) return <span className="text-muted-foreground">—</span>;
  if (!url) return <div className="h-10 w-10 rounded border bg-muted animate-pulse" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="View attachment">
      <img src={url} alt="" className="h-10 w-10 rounded border object-cover" />
    </a>
  );
}

export function AttachmentViewLink({ stored, children }: { stored: string | null | undefined; children: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!stored) { setUrl(null); return; }
    getAttachmentSignedUrl(stored).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [stored]);
  if (!stored || !url) return null;
  return <a href={url} target="_blank" rel="noreferrer" className="underline">{children}</a>;
}
