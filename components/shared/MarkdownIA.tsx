"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * El texto de los agentes IA (Tutor, Buscador) renderizado como se debe: títulos, negritas,
 * listas y tablas de verdad — no asteriscos y numerales crudos (pedido de Leonardo, 2/9).
 * Estilos a mano porque el proyecto no usa el plugin de tipografía de Tailwind; medidos para
 * vivir dentro de una burbuja de chat (títulos discretos, listas compactas).
 */
export function MarkdownIA({ texto }: { texto: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <p className="text-base font-bold mt-1 mb-1">{children}</p>,
        h2: ({ children }) => <p className="text-[15px] font-bold mt-1 mb-1">{children}</p>,
        h3: ({ children }) => <p className="text-[15px] font-semibold mt-1 mb-0.5">{children}</p>,
        p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-accent break-words">{children}</a>
        ),
        code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-[13px]">{children}</code>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-accent/40 pl-3 my-1 text-muted-foreground">{children}</blockquote>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-2"><table className="text-sm border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/50">{children}</table></div>
        ),
        hr: () => <hr className="my-2 border-border/50" />,
      }}
    >
      {texto}
    </ReactMarkdown>
  )
}
