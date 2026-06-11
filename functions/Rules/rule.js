// Load yaml
const yaml = require('js-yaml');

// Load file system
const fs = require('fs');

// Load path
const path = require('path');
const { scopeString } = require('./scopeString.js');


const rules = yaml.load(fs.readFileSync(path.join(__dirname, 'rules.yaml'), 'utf8'));


function findBracketMatches(value, open = '(', close = ')') {
    let matches = [];
    let stack = [];
    for (let i = 0; i < value.length; i++) {
        if (value[i] === open) {
            stack.push(i);
        } else if (value[i] === close) {
            if (stack.length > 0) {
                matches.unshift([stack.pop(), i]);
            }
        }
    }
    return matches;
} 

function buildFunction(stub, value) {
    let matches = findBracketMatches(stub);
    let params = []
    let name = stub;
    if (matches.length > 0) {
        name = stub.substring(0, matches[0][0]).trim();
        let args = stub.substring(matches[0][0] + 1, matches[0][1]);
        args = args.split(',').map(param => {
            let [key, value] = param.split('=');
            return [key.trim(), (value ? value.trim() : null)];
        });
        params = args;
    }

    let func = (...args) => {
        let result = value;
        for (let i = 0; i < params.length; i++) {
            let [key, defaultValue] = params[i];
            if (key.length === 0) continue;
            let value = args[i] || defaultValue;
            result = result.replace(new RegExp(`(?<![\\$\\.\\w])${key}\\b`, 'g'), value);
        }

        return `${result}`;
    }

    return {name, func, params: params}
}

function resolve(scope, functions = {}, isRoot = false) {
    switch (scope.type) {
        case "function":
            let resolvedArgs = scope.args.map(arg => resolve(arg, functions));
            if (functions[scope.name]) {
                let value = functions[scope.name].func(...resolvedArgs);
                if (isRoot) {
                    return value;
                } else {
                    return `(${value})`;
                }
            }
            return `${scope.name}(${resolvedArgs.join(', ')})`;
        case "text": 
            return scope.value;
            
        case "list":
            return scope.items.map(item => resolve(item, functions)).join('');

        case "bracket":
            return `(${scope.value.map(item => resolve(item, functions)).join('')})`;

        default:
            return "";
    }
}

function parseRules(rules, functions = {}) {
    let result = {};

    // if it's a string, parse it as a rule
    if (typeof rules === "string") {
        const scope = scopeString(rules).trim();
        result = resolve(scope, functions, scope.type === "function");

    // if it's an object, recursively parse its keys
    } else if (typeof rules === "object" && rules !== null) {

        if (Array.isArray(rules)) {
            result = rules.map(r => parseRules(r, functions));
        } else {
            const newFunction = {...functions};
            if (rules[".functions"]) {
                for (const key in rules[".functions"]) {
                    const func = buildFunction(key, rules[".functions"][key]);
                    newFunction[func.name] = func;
                }
            }
            for (const key in rules) {
                if (key === ".functions") continue;
                result[key] = parseRules(rules[key], newFunction);
            }
        }
    } else {
        result = rules;
    }

    return result;
}

function parseArrayKeys(r) {
    if (typeof r !== "object" || r === null) {
        if (typeof r === "string") {
            return r.trim().replace(/\n/g, ' ');
        } else {
            return r;
        }
    } else if (Array.isArray(r)) {
        return r.map(parseArrayKeys);
    }

    let result = {};

    for (const key in r) {
        const value = parseArrayKeys(r[key]);
        if (key.startsWith(".[")) {
            const keys = key.slice(2, -1).split('|').map(s => s.trim());
            for (const k of keys) {
                result[k] = value;
            }
        } else {
            result[key] =  value;
        }
    }
    return result;
}

const rulesParsed = parseArrayKeys(parseRules(rules));
const newRules = {rules: rulesParsed};
fs.writeFileSync(path.join(__dirname, 'rules-parsed.json'), JSON.stringify(newRules, null, 2));