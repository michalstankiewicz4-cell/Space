// Tiny scripting language for the programmable drone (see
// drone.js/interpreter.js). Deliberately NOT JavaScript — a hand-rolled
// lexer + recursive-descent parser producing a small AST, so scripts run
// through our own interpreter (interpreter.js) and can never touch
// anything outside the handful of builtin functions we expose. No eval(),
// no Function() — the whole point is a safe, sandboxed mini-language.
//
// Grammar (statements don't need semicolons/newlines are just whitespace):
//   program   := statement*
//   statement := 'if' '(' expr ')' statement ('else' statement)?
//              | 'while' '(' expr ')' statement
//              | '{' statement* '}'
//              | IDENT '=' expr
//              | expr
//   expr      := or
//   or        := and ('||' and)*
//   and       := equality ('&&' equality)*
//   equality  := comparison (('=='|'!=') comparison)*
//   comparison:= additive (('<'|'>'|'<='|'>=') additive)*
//   additive  := multiplicative (('+'|'-') multiplicative)*
//   multiplicative := unary (('*'|'/') unary)*
//   unary     := ('!'|'-')? primary
//   primary   := NUMBER | STRING | 'true' | 'false' | IDENT '(' args? ')'
//              | IDENT | '(' expr ')'
//   args      := expr (',' expr)*

const KEYWORDS = new Set(["if", "else", "while", "true", "false"]);

function tokenize(src){
  const tokens = [];
  let i = 0, line = 1;
  const n = src.length;
  while(i < n){
    const c = src[i];
    if(c === "\n"){ line++; i++; continue; }
    if(/\s/.test(c)){ i++; continue; }
    if(c === "#" || (c === "/" && src[i+1] === "/")){ // line comments
      while(i < n && src[i] !== "\n") i++;
      continue;
    }
    if(/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i+1]||""))){
      let j = i+1;
      while(j < n && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: "number", value: parseFloat(src.slice(i,j)), line });
      i = j;
      continue;
    }
    if(c === '"'){
      // Only used for print()'s message (see drone/dronePrintFx.js) — the
      // rest of the language is purely numeric, so a string is otherwise
      // just an opaque value with nowhere else to go.
      let j = i+1, out = "";
      while(j < n && src[j] !== '"'){
        if(src[j] === "\\" && j+1 < n){ out += src[j+1]; j += 2; }
        else { out += src[j]; j++; }
      }
      if(j >= n) throw new Error("Unterminated string at line " + line);
      tokens.push({ type: "string", value: out, line });
      i = j+1;
      continue;
    }
    if(/[a-zA-Z_]/.test(c)){
      let j = i+1;
      while(j < n && /[a-zA-Z0-9_]/.test(src[j])) j++;
      const word = src.slice(i,j);
      if(KEYWORDS.has(word)) tokens.push({ type: word, line });
      else tokens.push({ type: "ident", value: word, line });
      i = j;
      continue;
    }
    const two = src.slice(i, i+2);
    if(["==","!=","<=",">=","&&","||"].indexOf(two) !== -1){
      tokens.push({ type: two, line }); i += 2; continue;
    }
    if("+-*/(){},;=<>!".indexOf(c) !== -1){
      tokens.push({ type: c, line }); i++; continue;
    }
    throw new Error("Unexpected character '" + c + "' at line " + line);
  }
  tokens.push({ type: "eof", line });
  return tokens;
}

function parse(src){
  const tokens = tokenize(src);
  let pos = 0;

  function peek(){ return tokens[pos]; }
  function at(type){ return tokens[pos].type === type; }
  function advance(){ return tokens[pos++]; }
  function expect(type){
    if(!at(type)) throw new Error("Expected '" + type + "' but got '" + tokens[pos].type + "' at line " + tokens[pos].line);
    return advance();
  }
  function skipSemis(){ while(at(";")) advance(); }

  function parseProgram(){
    const body = [];
    skipSemis();
    while(!at("eof")){
      body.push(parseStatement());
      skipSemis();
    }
    return { type: "Program", body: body };
  }

  function parseStatement(){
    if(at("if")) return parseIf();
    if(at("while")) return parseWhile();
    if(at("{")) return parseBlock();
    if(at("ident") && tokens[pos+1] && tokens[pos+1].type === "="){
      const name = advance().value;
      advance(); // '='
      const value = parseExpr();
      return { type: "Assign", name: name, value: value };
    }
    const expr = parseExpr();
    return { type: "ExprStmt", expr: expr };
  }

  function parseBlock(){
    expect("{");
    const body = [];
    skipSemis();
    while(!at("}")){
      body.push(parseStatement());
      skipSemis();
    }
    expect("}");
    return { type: "Block", body: body };
  }

  function parseIf(){
    expect("if"); expect("(");
    const test = parseExpr();
    expect(")");
    const consequent = parseStatement();
    let alternate = null;
    skipSemis();
    if(at("else")){ advance(); alternate = parseStatement(); }
    return { type: "If", test: test, consequent: consequent, alternate: alternate };
  }

  function parseWhile(){
    expect("while"); expect("(");
    const test = parseExpr();
    expect(")");
    const body = parseStatement();
    return { type: "While", test: test, body: body };
  }

  function parseExpr(){ return parseOr(); }

  function parseOr(){
    let left = parseAnd();
    while(at("||")){ advance(); left = { type: "Binary", op: "||", left: left, right: parseAnd() }; }
    return left;
  }
  function parseAnd(){
    let left = parseEquality();
    while(at("&&")){ advance(); left = { type: "Binary", op: "&&", left: left, right: parseEquality() }; }
    return left;
  }
  function parseEquality(){
    let left = parseComparison();
    while(at("==") || at("!=")){
      const op = advance().type;
      left = { type: "Binary", op: op, left: left, right: parseComparison() };
    }
    return left;
  }
  function parseComparison(){
    let left = parseAdditive();
    while(at("<") || at(">") || at("<=") || at(">=")){
      const op = advance().type;
      left = { type: "Binary", op: op, left: left, right: parseAdditive() };
    }
    return left;
  }
  function parseAdditive(){
    let left = parseMultiplicative();
    while(at("+") || at("-")){
      const op = advance().type;
      left = { type: "Binary", op: op, left: left, right: parseMultiplicative() };
    }
    return left;
  }
  function parseMultiplicative(){
    let left = parseUnary();
    while(at("*") || at("/")){
      const op = advance().type;
      left = { type: "Binary", op: op, left: left, right: parseUnary() };
    }
    return left;
  }
  function parseUnary(){
    if(at("!") || at("-")){
      const op = advance().type;
      return { type: "Unary", op: op, arg: parseUnary() };
    }
    return parsePrimary();
  }
  function parsePrimary(){
    if(at("number")) return { type: "Number", value: advance().value };
    if(at("string")) return { type: "String", value: advance().value };
    if(at("true")){ advance(); return { type: "Bool", value: true }; }
    if(at("false")){ advance(); return { type: "Bool", value: false }; }
    if(at("(")){ advance(); const e = parseExpr(); expect(")"); return e; }
    if(at("ident")){
      const name = advance().value;
      if(at("(")){
        advance();
        const args = [];
        if(!at(")")){
          args.push(parseExpr());
          while(at(",")){ advance(); args.push(parseExpr()); }
        }
        expect(")");
        return { type: "Call", name: name, args: args };
      }
      return { type: "Ident", name: name };
    }
    throw new Error("Unexpected token '" + peek().type + "' at line " + peek().line);
  }

  const program = parseProgram();
  return program;
}

export function parseDroneScript(src){
  return parse(src);
}
