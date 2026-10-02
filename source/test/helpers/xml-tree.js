// Minimāls XML parsētājs testiem un pārbaudes rīkiem (bez DTD un CDATA atbalsta).

function decode(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseXml(source) {
  const pattern = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let match;
  while ((match = pattern.exec(source))) {
    const [, closing, opening, attrText, selfClosing, text] = match;
    if (closing) {
      const node = stack.pop();
      if (node.name !== closing) throw new Error(`Nepareizi aizvērts elements: </${closing}>, gaidīts </${node.name}>`);
    } else if (opening) {
      const attrs = {};
      for (const a of attrText.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
      const node = { name: opening, attrs, children: [], text: '' };
      stack.at(-1).children.push(node);
      if (!selfClosing) stack.push(node);
    } else if (text !== undefined) {
      stack.at(-1).text += decode(text);
    }
  }
  if (stack.length !== 1) throw new Error('XML satur neaizvērtus elementus');
  return root.children[0];
}

// Atrod pirmo elementu pēc ceļa, piem., "cac:AccountingSupplierParty/cac:Party/cbc:EndpointID".
export function find(node, path) {
  let current = node;
  for (const name of path.split('/')) {
    current = current?.children.find((c) => c.name === name);
  }
  return current ?? null;
}

export function findAll(node, name) {
  return node.children.filter((c) => c.name === name);
}

export function textAt(node, path) {
  const found = find(node, path);
  return found ? found.text.trim() : null;
}

// Visi elementi kokā (dziļumā) kopā ar ceļu no saknes.
export function walk(node, visit, path = node.name) {
  visit(node, path);
  for (const child of node.children) walk(child, visit, `${path}/${child.name}`);
}
