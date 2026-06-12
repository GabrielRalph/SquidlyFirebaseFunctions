
The "function scope" is an object with keys in the form 
    functionName(a)

and values may be something like (i.e. the result of the function)
    a == 5 && someOtherFunction(6, a)

keys (aka function stubs) can include default parameters like:
    functionName(a = something)


The "data scope" is an object that may contain the key ".function" for which the value is a function scope
apart from that every other key can be anything else. The value for any other key can be:
a number,
an object (aka a data scope)
a string,
a boolean 

Our goal is to resolve a datascope, which means resolving every string in the datascope
and every function it calls, as well as resolving sub datascopes.

when resolving sub datascopes function scopes from previous datascopes should be included.

If a string for example was "functionName($test) && auth.uid !== null" then this would resolve
to:
"(a == 5 && someOtherFunction(6, a)) && auth.uid !== null"

but if "someOtherFunction(a, b)" was defined in the function scope as say "(a && b) || (!a && !b)

then the original string would resolve to:
"(a == 5 && (6 && a) || (!6 && !a)) && auth.uid !== null"

your goal is to create a js module with entry point function called: resolveDataScope(data)
that resolves the dataScope data provided.
