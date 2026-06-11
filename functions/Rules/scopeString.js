
class ScopeFunction {
    type = "function";
    name = "";
    args = [];
    
    toString() {
        return `${this.name}(${this.args.join(', ')})`;
    }
}

class ScopeText {
    type = "text";
    value = "";
    
    toString() {
        return this.value;
    }
}

class ScopeBracket {
    type = "bracket";
    open = "(";
    close = ")";
    value = [];
    
    toString() {
        return `${this.open}${this.value.map(v => v.toString()).join('')}${this.close}`;
    }
}

class ScopeList {
    type = "list";
    items = [];

    get peak() {
        return this.items[this.items.length - 1];
    }
    get start() {
        return this.items[0];
    }

    trim() {
       while (this.start && this.start.type === "text" && /^\s*$/.test(this.start.value)) {
           this.items.shift();
       }
       while (this.peak && this.peak.type === "text" && /^\s*$/.test(this.peak.value)) {
           this.items.pop();
       }
       if (this.items.length === 1) {
            return this.items[0];
       } else {
            return this;
       }
    }
    
    toString() {
        return this.items.join('');
    }
}

function tokenize(input) {
    const tokens = [];

    let i = 0;

    const isAlpha = c => /[a-zA-Z_$]/.test(c);
    const isAlnum = c => /[a-zA-Z0-9_$]/.test(c);

    while (i < input.length) {
        const ch = input[i];

        // whitespace (keep as text token or skip — your choice)
        if (/\s/.test(ch)) {
            let start = i;
            while (i < input.length && /\s/.test(input[i])) i++;
            tokens.push({ type: "whitespace", value: input.slice(start, i) });
            continue;
        }

        // strings
        if (ch === "'" || ch === '"') {
            const quote = ch;
            let start = i;
            i++;

            while (i < input.length) {
                if (input[i] === quote && input[i - 1] !== "\\") {
                    i++;
                    break;
                }
                i++;
            }

            tokens.push({
                type: "string",
                value: input.slice(start, i)
            });

            continue;
        }

        // punctuation
        if ("()[]{}".includes(ch)) {
            tokens.push({ type: "bracket", value: ch });
            i++;
            continue;
        }

        // operators (simple multi-char support)
        if ("&|=!".includes(ch)) {
            let start = i;
            i++;

            while (
                i < input.length &&
                "=|&!".includes(input[i])
            ) {
                i++;
            }

            tokens.push({
                type: "operator",
                value: input.slice(start, i)
            });

            continue;
        }

        // identifiers + dotted names
        if (isAlpha(ch)) {
            let start = i;

            while (
                i < input.length &&
                (isAlnum(input[i]) || input[i] === ".")
            ) {
                i++;
            }

            tokens.push({
                type: "identifier",
                value: input.slice(start, i)
            });

            continue;
        }

        // commas
        if (ch === ",") {
            tokens.push({ type: "comma", value: "," });
            i++;
            continue;
        }

        // fallback (unknown char)
        tokens.push({ type: "text", value: ch });
        i++;
    }

    return tokens;
}

function consumeUntil(tokens, i, open, close) {
    let depth = 1; // IMPORTANT: we already consumed the opening bracket
    let start = i;

    for (; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.type === "bracket" && t.value === open) {
            depth++;
        }

        if (t.type === "bracket" && t.value === close) {
            depth--;

            if (depth === 0) {
                return {
                    content: tokens.slice(start, i),
                    next: i + 1
                };
            }
        }
    }

    throw new Error("Unclosed bracket " + open);
}

function splitArgs(tokens) {
    const args = [];

    let start = 0;
    let depthParen = 0;
    let depthBracket = 0;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.type === "bracket") {
            if (t.value === "(") depthParen++;
            if (t.value === ")") depthParen--;
            if (t.value === "[") depthBracket++;
            if (t.value === "]") depthBracket--;
        }

        if (
            t.type === "comma" &&
            depthParen === 0 &&
            depthBracket === 0
        ) {
            args.push(tokens.slice(start, i));
            start = i + 1;
        }
    }

    args.push(tokens.slice(start));
    return args;
}

function tokensToScope(tokens) {
    const scope = [];

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        // TEXT (operators, whitespace, etc)
        if (t.type === "text" || t.type === "whitespace" || t.type === "operator") {
            const node = new ScopeText();
            node.value = t.value;
            scope.push(node);
            continue;
        }

        // STRING
        if (t.type === "string") {
            const node = new ScopeText();
            node.value = t.value;
            scope.push(node);
            continue;
        }

        // IDENTIFIER + FUNCTION CALL
        if (t.type === "identifier") {
            const next = tokens[i + 1];

            // FUNCTION CALL
            if (
                next &&
                next.type === "bracket" &&
                next.value === "("
            ) {
                const fnName = t.value;

                const { content, next: j } = consumeUntil(tokens, i + 2, "(", ")");

                const fn = new ScopeFunction();
                fn.name = fnName;

                const argGroups = splitArgs(content);

                fn.args = argGroups.map(group => {
                    const nested = tokensToScope(group);
                    return nested.trim();
                });

                scope.push(fn);
                i = j - 1;
                continue;
            }

            // plain identifier
            const node = new ScopeText();
            node.value = t.value;
            scope.push(node);
            continue;
        }

        // fallback
        const node = new ScopeText();
        node.value = t.value;
        scope.push(node);
    }
    let scopeList = new ScopeList();
    scopeList.items = scope;
    return scopeList;
}

function scopeString(input) {
    const tokens = tokenize(input);
    return tokensToScope(tokens);
}

module.exports = {scopeString};