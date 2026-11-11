import type { CommandDefinition, CommandContext } from './types';
import { stat, strerror, type Stat } from './helpers';

/** Small, documented teaching subsets retained from Tuxplore. */
export function exploreCommands(): CommandDefinition[] {
  const started = Date.now();
  const simple = (name: string, summary: string, fn: (ctx: CommandContext) => number | Promise<number>, usage = name): CommandDefinition => ({ name, summary, usage, run: fn });
  const alias = (name: string, target: string, summary: string): CommandDefinition => simple(name, summary, ctx => {
    const command = ctx.shell.commands().find(item => item.name === target);
    if (!command) { ctx.stderr(`${name}: ${target} is unavailable.\n`); return 127; } return command.run(ctx);
  }, `${name} [ARGUMENTS]`);
  return [
    simple('history', 'Show this terminal’s command history', ctx => { if (ctx.args.length) return bad(ctx, 'history'); ctx.stdout(ctx.shell.history().map((line,i) => `${String(i+1).padStart(4)}  ${line}`).join('\n') + '\n'); return 0; }),
    simple('date', 'Show the browser’s date and time', ctx => { if (ctx.args.length) return bad(ctx, 'date'); ctx.stdout(new Date().toString() + '\n'); return 0; }),
    simple('uptime', 'Show how long this practice session has been running', ctx => { if (ctx.args.length) return bad(ctx, 'uptime'); ctx.stdout(`Practice session up ${Math.max(0,Math.floor((Date.now()-started)/1000))} seconds (browser simulation)\n`); return 0; }),
    simple('printenv', 'Print environment values', ctx => { if (!ctx.args.length) { ctx.stdout(Object.entries(ctx.shell.env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n'); return 0; } let code=0; for(const name of ctx.args) { if (ctx.shell.env[name]===undefined) code=1; else ctx.stdout(ctx.shell.env[name]+'\n'); } return code; }, 'printenv [NAME ...]'),
    simple('rmdir', 'Remove empty directories', ctx => {
      if (!ctx.args.length || ctx.args.some(arg=>arg.startsWith('-'))) return bad(ctx,'rmdir DIRECTORY ...');
      let code=0; for(const raw of ctx.args) { const path=ctx.resolve(raw), info=stat(ctx,path); if(!info.ok || info.value.kind!=='dir') { ctx.stderr(`rmdir: ${raw}: ${!info.ok?strerror(info.error.code):'Not a directory'}\n`);code=1;continue; }
        const result=ctx.dispatch('fs.rmdir',{path}); if(!result.ok){ctx.stderr(`rmdir: ${raw}: ${strerror(result.error.code)}\n`);code=1;} } return code;
    }, 'rmdir DIRECTORY ...'),
    find(), alias('less', 'cat', 'Read a file in terminal scrollback (teaching subset; no pager)'), alias('more','cat','Read a file in terminal scrollback (teaching subset)'),
    alias('top','ps','Show a snapshot of simulated processes'), alias('htop','ps','Show a snapshot of simulated processes'),
    simple('make','A small sandwich Easter egg; no build execution',ctx=>{
      if(ctx.args.join(' ')==='me a sandwich') { if(ctx.user==='root') {ctx.activity?.('sandwich');ctx.stdout('Okay. 🥪\n');return 0;} ctx.stderr("make: What? Make it yourself.\n");return 1; }
      ctx.stderr('make: This teaching shell does not execute Makefiles.\n');return 1;
    },'make me a sandwich'),
    simple('tux','A friendly message from Tux',ctx=>{ctx.stdout(`Tux: ${ctx.args.join(' ') || 'Hi! Type hint for your adventure, or open Play to choose an activity.'}\n`);return 0;},'tux [MESSAGE]'),
    simple('bash','Read one of the two supported adventure scripts',ctx=>{
      if (!ctx.args[0]) {ctx.stdout('You are already in the teaching shell. bash FILE supports the adventure gate and stairs only.\n');return 0;}
      const result=ctx.dispatch<string>('learn-adventure.script',{path:ctx.resolve(ctx.args[0]),args:ctx.args.slice(1),readScript:true});
      if(!result.ok){ctx.stderr(`bash: ${result.error.message}\n`);return 1;}ctx.stdout(result.value);return 0;
    },'bash SCRIPT [ARGUMENTS]'),
    ...['xdg-open','open'].map(name=>simple(name,'Open a virtual path or a TuxOS app',async ctx=>{
      if(ctx.args.length>1)return bad(ctx,`${name} PATH|APP`);
      if(!ctx.shell.openApp){ctx.stderr(`${name}: opening apps is available from the learner’s desktop terminal.\n`);return 1;}
      const raw=ctx.args[0]??'.';
      const aliases:Record<string,string>={journal:'learn-adventure',pipedream:'pipe-dream',runner:'know-your-distro',installer:'try-linux',cheatsheet:'command-reference',achievements:'exploration-achievements'};
      const apps=['terminal','files','editor','settings','about','play','software','package-practice','learn-adventure','pipe-dream','know-your-distro','try-linux','command-reference','exploration-achievements','learn-linux','learn-docker','learn-filesystem'];
      const target=aliases[raw]??raw;
      let appId=target, args:Record<string,string>|undefined;
      if(!apps.includes(target)){const path=ctx.resolve(raw), info=stat(ctx,path);if(!info.ok){ctx.stderr(`${name}: ${raw}: ${strerror(info.error.code)}\n`);return 1;}appId=info.value.kind==='dir'?'files':'editor';args={path};}
      const result=await ctx.shell.openApp(appId,args);if(!result.ok){ctx.stderr(`${name}: ${result.error.message}\n`);return 1;}return 0;
    },`${name} [PATH|APP]`)),
    ...['reboot','shutdown','poweroff'].map(name=>simple(name,'Request a simulated session power action',ctx=>{
      if(ctx.args.length && !(name==='shutdown'&&ctx.args.join(' ')==='now'))return bad(ctx,name==='shutdown'?'shutdown [now]':name);
      const result=ctx.dispatch('session.power',{action:name==='reboot'?'restart':'shutdown'});
      if(!result.ok){ctx.stderr(`${name}: ${result.error.message}\n`);return 1;}ctx.stdout('Session action requested. Unsaved work is checked before leaving.\n');return 0;
    },name==='shutdown'?'shutdown [now]':name)),
  ];
}
function bad(ctx:CommandContext,usage:string){ctx.stderr(`Usage: ${usage}\n`);return 1;}
function find():CommandDefinition{return{name:'find',summary:'Find files by name and type',usage:'find [PATH] [-name GLOB] [-type f|d]',run(ctx){
  const args=[...ctx.args];const root=args[0]&&!args[0].startsWith('-')?args.shift()!:'.';let pattern='*',kind:string|undefined;
  while(args.length){const flag=args.shift(),value=args.shift();if(flag==='-name'&&value)pattern=value;else if(flag==='-type'&&['f','d'].includes(value??''))kind=value;else return bad(ctx,'find [PATH] [-name GLOB] [-type f|d]');}
  const regex=new RegExp('^'+[...pattern].map(char=>char==='*'?'.*':char==='?'?'.':char.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('')+'$');let code=0,count=0;
  const walk=(path:string,label:string)=>{if(++count>10000){if(count===10001)ctx.stderr('find: teaching traversal limit (10000 entries) reached. Narrow the starting path.\n');code=1;return;}
    const info=stat(ctx,path);if(!info.ok){ctx.stderr(`find: ${label}: ${strerror(info.error.code)}\n`);code=1;return;}
    if(regex.test(info.value.name)&&(!kind||info.value.kind===(kind==='f'?'file':'dir')))ctx.stdout(label+'\n');
    if(info.value.kind==='dir'){const listed=ctx.dispatch<Stat[]>('fs.list',{path});if(!listed.ok){ctx.stderr(`find: ${label}: ${strerror(listed.error.code)}\n`);code=1;return;}for(const child of listed.value)walk(`${path==='/'?'':path}/${child.name}`,`${label==='/'?'':label}/${child.name}`);}
  };walk(ctx.resolve(root),root);return code;
}};}
