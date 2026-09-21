// Tree-walking generator interpreter for the drone DSL (see dsl.js). Every
// function call `yield`s a {name, args} descriptor instead of calling
// straight into game code — the driver (drone.js) decides whether to
// resolve it immediately (fuel(), attack(), ...) or spread it over several
// frames (move()/turn()/wait()), by choosing when to call `.next(value)`
// to resume. `yield*` on the recursive calls below transparently forwards
// every yield (and the value sent back into it) up to whoever is driving
// the top-level generator, so blocking a nested call blocks the whole
// script exactly where you'd expect, without any special-casing here.
function truthy(v){ return !!v; }

export function* runProgram(node, env){
  yield* runBlock(node.body, env);
}

function* runBlock(body, env){
  for(let i=0; i<body.length; i++){
    yield* runStatement(body[i], env);
  }
}

function* runStatement(node, env){
  switch(node.type){
    case "Block":
      yield* runBlock(node.body, env);
      return;
    case "If": {
      const test = yield* evalExpr(node.test, env);
      if(truthy(test)) yield* runStatement(node.consequent, env);
      else if(node.alternate) yield* runStatement(node.alternate, env);
      return;
    }
    case "While": {
      while(truthy(yield* evalExpr(node.test, env))){
        // A loop body with no function calls at all (e.g. `while(true){ x = 1 }`)
        // would otherwise never yield — the generator would spin inside this
        // native JS loop forever on the very first .next() call, before the
        // driver's per-frame step counter (drone.js) ever gets a chance to
        // run and catch it. This unconditional per-iteration checkpoint
        // guarantees control always returns to the driver, so a runaway
        // loop is always caught within one frame instead of freezing the tab.
        yield { name: "__tick__", args: [] };
        yield* runStatement(node.body, env);
      }
      return;
    }
    case "Assign": {
      const v = yield* evalExpr(node.value, env);
      env.vars[node.name] = v;
      return;
    }
    case "ExprStmt":
      yield* evalExpr(node.expr, env);
      return;
    default:
      throw new Error("Unknown statement type: " + node.type);
  }
}

function* evalExpr(node, env){
  switch(node.type){
    case "Number": return node.value;
    case "String": return node.value;
    case "Bool": return node.value ? 1 : 0;
    case "Ident":
      return Object.prototype.hasOwnProperty.call(env.vars, node.name) ? env.vars[node.name] : 0;
    case "Unary": {
      const v = yield* evalExpr(node.arg, env);
      if(node.op === "!") return truthy(v) ? 0 : 1;
      if(node.op === "-") return -v;
      throw new Error("Unknown unary operator " + node.op);
    }
    case "Binary": {
      if(node.op === "&&"){
        const l = yield* evalExpr(node.left, env);
        if(!truthy(l)) return 0;
        return truthy(yield* evalExpr(node.right, env)) ? 1 : 0;
      }
      if(node.op === "||"){
        const l = yield* evalExpr(node.left, env);
        if(truthy(l)) return 1;
        return truthy(yield* evalExpr(node.right, env)) ? 1 : 0;
      }
      const l = yield* evalExpr(node.left, env);
      const r = yield* evalExpr(node.right, env);
      switch(node.op){
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? 0 : l / r;
        case "<": return l < r ? 1 : 0;
        case ">": return l > r ? 1 : 0;
        case "<=": return l <= r ? 1 : 0;
        case ">=": return l >= r ? 1 : 0;
        case "==": return l === r ? 1 : 0;
        case "!=": return l !== r ? 1 : 0;
        default: throw new Error("Unknown binary operator " + node.op);
      }
    }
    case "Call": {
      const args = [];
      for(let i=0; i<node.args.length; i++) args.push(yield* evalExpr(node.args[i], env));
      return yield { name: node.name, args: args };
    }
    default:
      throw new Error("Unknown expression type: " + node.type);
  }
}
