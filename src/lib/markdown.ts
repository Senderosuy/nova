/**
 * Visor de Markdown mínimo, sin dependencias.
 *
 * Cubre lo que aparece en un README: encabezados, listas, código,
 * citas, links, negrita, cursiva y tablas simples. No es un parser
 * completo — es un lector cómodo para documentación técnica.
 *
 * Escapa el HTML de entrada antes de procesar, así un README con
 * etiquetas no puede inyectar nada en el panel.
 */

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function inline(text: string): string {
  return (
    escapeHtml(text)
      // `código`
      .replace(
        /`([^`]+)`/g,
        '<code class="rounded bg-ink px-1 py-0.5 text-[0.85em] text-accent">$1</code>'
      )
      // **negrita**
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-cream">$1</strong>')
      // *cursiva*
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      // [texto](url) — solo http(s), para no abrir esquemas raros
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noreferrer" class="text-accent hover:underline">$1</a>'
      )
  );
}

export function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];

  let inCode = false;
  let listType: "ul" | "ol" | null = null;
  let inQuote = false;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      out.push("</blockquote>");
      inQuote = false;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");

    // Bloques de código
    if (/^\s*```/.test(line)) {
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        closeList();
        closeQuote();
        out.push(
          '<pre class="my-3 overflow-x-auto rounded-lg border border-line bg-ink p-3 text-xs"><code>'
        );
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      continue;
    }

    // Línea vacía
    if (!line.trim()) {
      closeList();
      closeQuote();
      continue;
    }

    // Encabezados
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      closeQuote();
      const level = h[1].length;
      const size =
        level === 1
          ? "mt-5 text-base font-semibold"
          : level === 2
            ? "mt-5 text-sm font-semibold"
            : "mt-4 text-xs font-semibold uppercase tracking-wide text-muted";
      out.push(`<h${level} class="font-display ${size}">${inline(h[2])}</h${level}>`);
      continue;
    }

    // Separador
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      closeList();
      closeQuote();
      out.push('<hr class="my-4 border-line" />');
      continue;
    }

    // Cita
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      closeList();
      if (!inQuote) {
        out.push('<blockquote class="my-2 border-l-2 border-line-2 pl-3 text-muted">');
        inQuote = true;
      }
      out.push(`<p>${inline(q[1])}</p>`);
      continue;
    }
    closeQuote();

    // Listas
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const want: "ul" | "ol" = ul ? "ul" : "ol";
      if (listType !== want) {
        closeList();
        out.push(
          want === "ul"
            ? '<ul class="my-2 list-disc space-y-1 pl-5">'
            : '<ol class="my-2 list-decimal space-y-1 pl-5">'
        );
        listType = want;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    }
    closeList();

    // Tabla: se muestra como línea monoespaciada, sin armar la grilla
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^[\s|:-]+$/.test(line)) continue; // separador de tabla
      out.push(
        `<p class="font-mono text-xs text-muted">${inline(line.replace(/^\||\|$/g, "").trim())}</p>`
      );
      continue;
    }

    out.push(`<p class="my-2">${inline(line)}</p>`);
  }

  if (inCode) out.push("</code></pre>");
  closeList();
  closeQuote();

  return out.join("\n");
}
