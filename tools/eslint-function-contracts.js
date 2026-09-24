/**
 * Finds the node whose leading comment documents a function.
 * Precondition: `fn` is a function node whose `parent` is set (ESLint guarantees this).
 * Postcondition: returns the outermost wrapper (variable declaration, class member,
 * property, export) or `fn` itself for declarations; returns null for anonymous inline
 * callbacks, which are exempt.
 */
function commentedNode(fn) {
  let target = fn;
  const parent = fn.parent;
  if (parent.type === 'VariableDeclarator') target = parent.parent;
  else if (['MethodDefinition', 'PropertyDefinition', 'Property'].includes(parent.type)) target = parent;
  else if (fn.type !== 'FunctionDeclaration') return null;
  const outer = target.parent;
  if (outer && (outer.type === 'ExportNamedDeclaration' || outer.type === 'ExportDefaultDeclaration')) {
    target = outer;
  }
  return target;
}

/**
 * Checks that a JSDoc body has a description, a Precondition and a Postcondition, all non-empty.
 * Precondition: `raw` is the text of a `/** ... *\/` comment without the delimiters.
 * Postcondition: returns true only when the three parts appear in that order.
 */
function hasContract(raw) {
  const text = raw.replace(/^\s*\*+ ?/gm, '').trim();
  const pre = text.indexOf('Precondition:');
  const post = text.indexOf('Postcondition:');
  return (
    pre > 0 &&
    post > pre &&
    text.slice(0, pre).trim().length > 0 &&
    text.slice(pre + 'Precondition:'.length, post).trim().length > 0 &&
    text.slice(post + 'Postcondition:'.length).trim().length > 0
  );
}

/**
 * Best-effort display name of a function node for error messages.
 * Precondition: `fn` is a function node with `parent` set.
 * Postcondition: returns a non-empty string.
 */
function nameOf(fn) {
  return fn.id?.name ?? fn.parent?.key?.name ?? fn.parent?.id?.name ?? 'anonymous';
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      missing:
        'Function "{{name}}" needs a comment above it with a description, "Precondition:" and "Postcondition:".',
    },
  },
  /**
   * Builds the rule's visitor.
   * Precondition: `context` is a standard ESLint rule context.
   * Postcondition: reports each function lacking a complete contract comment.
   */
  create(context) {
    const source = context.sourceCode;
    /**
     * Reports one function node if its contract comment is missing or incomplete.
     * Precondition: `fn` is a function node.
     * Postcondition: at most one report is emitted for `fn`.
     */
    function check(fn) {
      const target = commentedNode(fn);
      if (!target) return;
      const docs = source.getCommentsBefore(target).filter((c) => c.type === 'Block' && c.value.startsWith('*'));
      const doc = docs.at(-1);
      if (doc && hasContract(doc.value)) return;
      context.report({ node: fn, messageId: 'missing', data: { name: nameOf(fn) } });
    }
    return { FunctionDeclaration: check, FunctionExpression: check, ArrowFunctionExpression: check };
  },
};
