#!/usr/bin/env node
var argv, o, $args, that, filename, __join = [].join;
argv = process.argv;
global.Coco = require('./coco');
global.fs = require('fs');
global.path = require('path');
global.util = require('util');
global.say = function(it){
  process.stdout.write(it + '\n');
};
global.warn = function(it){
  process.stderr.write(it + '\n');
};
global.die = function(it){
  warn(it);
  process.exit(1);
};
global.p = function(){
  [].forEach.call(arguments, console.dir);
};
global.pp = function(x, showHidden, depth){
  say(util.inspect(x, showHidden, depth, !process.env.NODE_DISABLE_COLORS));
};
global.ppp = function(it){
  pp(it, true, null);
};
$args = (o = require('./optparse')({
  interactive: 'start REPL; use ^J for multiline input',
  compile: 'compile to JavaScript and save as .js files',
  output: ['compile into the specified directory', 'DIR'],
  watch: 'watch scripts for changes, and repeat',
  stdin: 'read stdin',
  eval: 'read command line arguments as script',
  require: ['require libraries before executing', 'FILE+'],
  bare: 'compile without the top-level function wrapper',
  print: 'print the result to stdout',
  lex: 'print the tokens the lexer produces',
  tokens: 'print the tokens the rewriter produces',
  ast: 'print the syntax tree the parser produces',
  json: 'print/compile as JSON',
  nodejs: ['pass options through to the "node" binary', 'ARGS+', ''],
  version: 'display version',
  help: 'display this'
})).$args;
if (that = __join.call(o.$unknowns, ' ')) {
  die("Unrecognized option(s): " + that + "\n\n" + help());
}
switch (false) {
case !o.nodejs:
  forkNode();
  break;
case !o.version:
  say(version());
  break;
case !o.help:
  say(help());
  break;
default:
  o.run = !(o.compile || (o.compile = o.output));
  process.execPath = argv[0] = argv[1];
  argv.splice(2, 9e9);
  argv.push.apply(argv, o.stdin
    ? $args
    : o.run
      ? $args.splice(1, 9e9)
      : []);
  if (that = o.require) {
    (filename = module.filename, module).filename = '.';
    that.forEach(require);
    module.filename = filename;
  }
  switch (false) {
  case !o.eval:
    argv[1] = 'eval';
    compileScript('', __join.call($args, '\n'));
    break;
  case !o.interactive:
    repl();
    break;
  case !o.stdin:
    compileStdin();
    break;
  case !$args.length:
    compileScripts();
    break;
  case !require('tty').isatty(0):
    say(version() + '\n' + help() + '\n');
    repl();
    break;
  default:
    compileStdin();
  }
}
function fshoot(name, arg, callback){
  fs[name](arg, function(e, result){
    if (e) {
      die(e.stack || e);
    }
    callback(result);
  });
}
function compileScripts(){
  $args.forEach(function(it){
    walk(it, void 8, true);
  });
  function walk(source, base, top){
    base == null && (base = path.normalize(source));
    function work(){
      fshoot('readFile', source, function(it){
        compileScript(source, it + "", base);
      });
    }
    fs.stat(source, function(e, stats){
      if (e) {
        if (top && !/\.co$/.test(source)) {
          return walk(source + ".co");
        }
        die("Can't find: " + source);
      }
      if (stats.isDirectory()) {
        fshoot('readdir', source, function(it){
          it.forEach(function(it){
            walk(path.join(source, it), base);
          });
        });
      } else if (top || path.extname(source).toLowerCase() === '.co') {
        if (o.watch) {
          watch(source, work);
        } else {
          work();
        }
      }
    });
  }
}
function compileScript(filename, input, base){
  var options, t, e;
  options = {
    filename: filename,
    bare: o.bare
  };
  t = {
    input: input,
    options: options
  };
  try {
    Coco.emit('lex', t);
    t.tokens = Coco.tokens(t.input, {
      raw: o.lex
    });
    if (o.lex || o.tokens) {
      printTokens(t.tokens);
      throw null;
    }
    Coco.emit('parse', t);
    t.ast = Coco.ast(t.tokens);
    if (o.ast) {
      say(o.json
        ? t.ast.stringify(2)
        : ''.trim.call(t.ast));
      throw null;
    }
    Coco.emit('compile', t);
    options.bare || (options.bare = o.json || o.run);
    if (o.json || o.run && o.print) {
      t.ast.makeReturn();
    }
    t.output = t.ast.compileRoot(options);
    if (o.json || o.run) {
      Coco.emit('run', t);
      t.result = Coco.run(t.output, options, true);
    }
    if (o.json) {
      t.output = JSON.stringify(t.result, null, 2) + '\n';
    }
    if (o.run) {
      switch (false) {
      case !o.json:
        process.stdout.write(t.output);
        break;
      case !o.print:
        console.log(t.result);
      }
      throw null;
    }
    Coco.emit('write', t);
    if (o.print || !filename) {
      say(t.output.trimRight());
    } else {
      writeJS(filename, t.output, base);
    }
  } catch (e) {
    if (e != null) {
      if (Coco.listeners('failure').length) {
        Coco.emit('failure', e, t);
      } else {
        if (filename) {
          warn("Failed at: " + filename);
        }
        if (!(e instanceof SyntaxError || /^Parse error /.test(e.message))) {
          e = e.stack || e;
        }
        if (o.watch) {
          warn(e + '\x07');
        } else {
          die(e);
        }
      }
      return;
    }
  }
  Coco.emit('success', t);
}
function compileStdin(){
  argv[1] = 'stdin';
  (function(){
    var code;
    code = '';
    this.on('data', function(it){
      code += it;
    });
    this.on('end', function(){
      compileScript('', code);
    });
  }.call(process.openStdin()));
}
function watch(source, action){
  (function loop(ptime){
    fshoot('stat', source, function(__arg){
      var mtime;
      mtime = __arg.mtime;
      if (ptime ^ mtime) {
        action();
      }
      setTimeout(loop, 500, mtime);
    });
  }.call(this, 0));
}
function writeJS(source, js, base){
  var filename, dir, that, jsPath;
  filename = path.basename(source).replace(/(?:(\.\w+)?\.\w+)?$/, function(){
    return arguments[1] || (o.json ? '.json' : '.js');
  });
  dir = path.dirname(source);
  if (that = o.output) {
    dir = path.join(that, dir.slice(base === '.'
      ? 0
      : base.length));
  }
  jsPath = path.join(dir, filename);
  function compile(){
    fs.writeFile(jsPath, js || '\n', function(e){
      if (e) {
        return warn(e);
      }
      if (o.watch) {
        util.log(source + " => " + jsPath);
      }
    });
  }
  fs.stat(dir, function(e){
    if (!e) {
      return compile();
    }
    require('child_process').exec("mkdir " + [!/^win/.test(process.platform) ? '-p' : void 8] + " " + dir, compile);
  });
}
function printTokens(tokens){
  var lines, tag, val, lno, l, __i, __len, __ref;
  lines = [];
  for (__i = 0, __len = tokens.length; __i < __len; ++__i) {
    __ref = tokens[__i], tag = __ref[0], val = __ref[1], lno = __ref[2];
    (lines[lno] || (lines[lno] = [])).push(tag.toLowerCase() === val
      ? tag
      : tag + ":" + val);
  }
  for (__i = 0, __len = lines.length; __i < __len; ++__i) {
    l = lines[__i];
    say(l ? l.join(' ').replace(/\n/g, '\\n') : '');
  }
}
function repl(){
  var code, cont, rl, reset, prompt, that, vm, server, _ttyWrite, __ref;
  argv[1] = 'repl';
  code = '';
  cont = 0;
  rl = require('readline').createInterface(process.stdin, process.stdout);
  reset = function(){
    rl.line = code = '';
    rl.prompt();
  };
  (_ttyWrite = rl._ttyWrite, rl)._ttyWrite = function(char){
    if (char === '\n') {
      cont += 1;
    } else {
      cont = 0;
    }
    return _ttyWrite.apply(this, arguments);
  };
  prompt = 'coco';
  if (that = [o.bare ? 'b' : void 8, o.compile ? 'c' : void 8].join('')) {
    prompt += " -" + that;
  }
  if (!o.compile) {
    module.paths = module.constructor._nodeModulePaths(module.filename = process.cwd() + '/repl');
    vm = require('vm');
    global.module = module;
    global.exports = exports;
    global.require = require;
    server = (__ref = __clone(require('repl').REPLServer.prototype), __ref.context = global, __ref.commands = [], __ref.useGlobal = true, __ref.useColors = process.env.NODE_DISABLE_COLORS, __ref.eval = function(code, __arg, __arg1, cb){
      var res, err;
      try {
        res = vm.runInThisContext(code, 'repl');
      } catch (e) {
        err = e;
      }
      cb(err, res);
    }, __ref);
    rl.completer = __bind(server, 'complete');
  }
  rl.on('SIGCONT', rl.prompt);
  rl.on('SIGINT', function(){
    if (this.line || code) {
      say('');
      reset();
    } else {
      this.close();
    }
  });
  rl.on('close', __bind(process, 'exit'));
  rl.on('line', function(it){
    var _;
    if (0 < cont && cont < 3) {
      code += it + '\n';
      this.output.write(__repeatString('.', prompt.length) + '. ');
      return;
    }
    code += it;
    try {
      if (o.compile) {
        say(Coco.compile(code, {
          bare: o.bare
        }));
      } else {
        _ = vm.runInThisContext(Coco.compile(code, {
          'eval': 'eval',
          bare: o.bare
        }), 'repl');
        _ != null && (global._ = _);
        pp(_);
        if (typeof _ === 'function') {
          say(_);
        }
      }
    } catch (e) {
      say(e);
    }
    reset();
  });
  process.on('uncaughtException', function(it){
    say("\n" + ((it != null ? it.stack : void 8) || it));
  });
  process.on('exit', function(){
    if (code && rl.output.isTTY) {
      cont = 0;
      say('');
      rl.emit('line', '');
    }
  });
  rl.setPrompt(prompt + "> ");
  rl.prompt();
}
function forkNode(){
  var args, i, that;
  args = argv.slice(1);
  i = 0;
  while (that = args[++i]) {
    if (that === '--nodejs') {
      args.splice(i--, 2);
    }
  }
  require('child_process').spawn(process.execPath, o.nodejs.join(' ').trim().split(/\s+/).concat(args), {
    cwd: process.cwd(),
    env: process.env,
    customFds: [0, 1, 2]
  });
}
function help(){
  return "Usage: coco [options] [files] [arguments]\n\nOptions:\n" + o;
}
function version(){
  return "Coco " + Coco.VERSION;
}
function __clone(it){
  function fun(){} fun.prototype = it;
  return new fun;
}
function __bind(obj, key){
  return function(){ return obj[key].apply(obj, arguments) };
}
function __repeatString(str, n){
  for (var r = ''; n > 0; (n >>= 1) && (str += str)) if (n & 1) r += str;
  return r;
}