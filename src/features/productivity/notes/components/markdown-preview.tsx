import { ImageOff } from "lucide-react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/cn";

/**
 * Elementos mapeados para classes do tema. HTML bruto no Markdown nunca é
 * renderizado (padrão do react-markdown). Links não navegam — abriria a URL
 * dentro da janela do app — e imagens não são carregadas (local-first):
 * ambos aparecem como texto, com o endereço no título.
 */
const components: Components = {
  h1: ({ node: _node, ...props }) => (
    <h1 className="mt-6 mb-3 text-2xl font-semibold first:mt-0" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 className="mt-5 mb-2 text-xl font-semibold first:mt-0" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="mt-4 mb-2 text-lg font-semibold first:mt-0" {...props} />
  ),
  h4: ({ node: _node, ...props }) => (
    <h4 className="mt-4 mb-2 font-semibold first:mt-0" {...props} />
  ),
  p: ({ node: _node, ...props }) => <p className="my-3 leading-relaxed first:mt-0" {...props} />,
  ul: ({ node: _node, className, ...props }) => (
    <ul
      className={cn(
        "my-3 grid gap-1 pl-6",
        className?.includes("contains-task-list") ? "list-none pl-1" : "list-disc",
      )}
      {...props}
    />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="my-3 grid list-decimal gap-1 pl-6" {...props} />
  ),
  li: ({ node: _node, ...props }) => <li className="leading-relaxed" {...props} />,
  input: ({ node: _node, ...props }) => (
    <input {...props} disabled className="mr-2 size-3.5 translate-y-0.5 accent-primary" />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="my-3 border-l-2 border-primary/60 pl-4 text-muted-foreground italic"
      {...props}
    />
  ),
  hr: () => <hr className="my-5 border-border" />,
  a: ({ node: _node, href, children }) => (
    <span className="text-primary underline underline-offset-2" title={href}>
      {children}
    </span>
  ),
  img: ({ alt, src }) => (
    <span
      className="inline-flex items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground"
      title={typeof src === "string" ? src : undefined}
    >
      <ImageOff className="size-3" aria-hidden="true" />
      {alt || "imagem"}
    </span>
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="my-3 overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  code: ({ node: _node, ...props }) => (
    <code className="rounded bg-raised px-1 py-0.5 font-mono text-[0.85em]" {...props} />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="border border-border bg-raised px-2 py-1 text-left font-medium" {...props} />
  ),
  td: ({ node: _node, ...props }) => <td className="border border-border px-2 py-1" {...props} />,
};

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  if (content.trim() === "") {
    return (
      <p className={cn("text-sm text-subtle-foreground", className)}>Nada para mostrar ainda.</p>
    );
  }
  return (
    <div className={cn("text-sm break-words", className)} data-selectable>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}
